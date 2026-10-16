"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorText, Spinner, cx } from "@/components/ui";
import { api, useApi, useNow, type GroupInfo } from "@/lib/client";
import { cityName, currentSlot, formatHour, inWindow } from "@/lib/time";

const CLIP_MS = 2500;

type Clip = { blob: Blob; url: string; durationMs: number };
type Phase = "starting" | "live" | "recording" | "review" | "uploading" | "fallback";

const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

async function openCamera(facing: "user" | "environment") {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 720 },
    height: { ideal: 1280 },
    frameRate: { ideal: 30 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch (err) {
    // Microphone refused but camera may still be allowed: record silent clips.
    if ((err as Error).name === "NotAllowedError" || (err as Error).name === "NotFoundError") {
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    throw err;
  }
}

/** Dev-only stand-in when there's no camera (e.g. the desktop preview browser). */
function fakeCameraStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    const g = ctx.createLinearGradient(0, 0, 720, 1280);
    g.addColorStop(0, `hsl(${(t * 40) % 360} 70% 45%)`);
    g.addColorStop(1, `hsl(${(t * 40 + 120) % 360} 70% 25%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 720, 1280);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("dev camera", 360, 600);
    ctx.font = "48px monospace";
    ctx.fillText(new Date().toLocaleTimeString(), 360, 690);
    ctx.beginPath();
    ctx.arc(360 + Math.sin(t * 3) * 220, 900, 60, 0, Math.PI * 2);
    ctx.fill();
    if (track.readyState === "live") requestAnimationFrame(draw);
  };
  draw();
  return stream;
}

function cameraError(err: unknown) {
  const name = (err as Error)?.name;
  if (name === "NotAllowedError") return "Camera access is blocked. Allow it for Day Vlog in your iPhone Settings, or use the iPhone camera below.";
  if (name === "NotFoundError") return "No camera found on this device.";
  return "The in-app camera didn't start. You can still use the iPhone camera.";
}

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: info } = useApi<GroupInfo>(`/api/groups/${id}`);
  const now = useNow(10_000);

  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [phase, setPhase] = useState<Phase>("starting");
  const [fake, setFake] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [progress, setProgress] = useState(0);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      stopStream();
      setPhase((p) => (p === "review" ? p : "starting"));
      let stream: MediaStream;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no camera API"), { name: "NotFoundError" });
        // Dev-only: /record?fake skips the real webcam (used for automated testing).
        if (process.env.NODE_ENV === "development" && window.location.search.includes("fake")) throw new Error("fake");
        stream = await openCamera(facing);
      } catch (err) {
        if (process.env.NODE_ENV !== "development") {
          if (!cancelled) {
            setError(cameraError(err));
            setPhase("fallback");
          }
          return;
        }
        stream = fakeCameraStream();
        setFake(true);
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => {});
      }
      setPhase((p) => (p === "review" ? p : "live"));
    })();
    return () => {
      cancelled = true;
    };
  }, [facing, stopStream]);

  useEffect(() => stopStream, [stopStream]);

  function record() {
    const stream = streamRef.current;
    if (!stream || phase !== "live") return;
    const mimeType = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
    } catch {
      setError("This phone can't record in the app. Use the iPhone camera instead.");
      setPhase("fallback");
      return;
    }
    const chunks: Blob[] = [];
    const t0 = performance.now();
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/mp4";
      const blob = new Blob(chunks, { type });
      setClip({ blob, url: URL.createObjectURL(blob), durationMs: Math.round(performance.now() - t0) });
      setPhase("review");
      setProgress(0);
    };
    recorder.start();
    setPhase("recording");
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / CLIP_MS);
      setProgress(p);
      if (p < 1) requestAnimationFrame(tick);
      else if (recorder.state === "recording") recorder.stop();
    };
    requestAnimationFrame(tick);
  }

  function retake() {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setCaption("");
    setError(null);
    setPhase(streamRef.current ? "live" : "fallback");
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const durationMs = await new Promise<number>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve(Math.round((v.duration || 0) * 1000));
      v.onerror = () => resolve(0);
      v.src = url;
    });
    setClip({ blob: file, url, durationMs });
    setPhase("review");
  }

  async function post() {
    if (!clip) return;
    setPhase("uploading");
    setError(null);
    try {
      const contentType = clip.blob.type || "video/mp4";
      const start = await api<{ clipId: string; upload: { url: string; headers: Record<string, string> } }>("/api/clips", {
        body: { groupId: id, contentType, sizeBytes: clip.blob.size },
      });
      const put = await fetch(start.upload.url, { method: "PUT", headers: start.upload.headers, body: clip.blob });
      if (!put.ok) throw new Error(`Upload failed (${put.status}). Check your connection and try again.`);
      await api(`/api/clips/${start.clipId}/complete`, {
        body: { durationMs: clip.durationMs, caption: caption.trim() || undefined },
      });
      stopStream();
      router.replace(`/g/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setPhase("review");
    }
  }

  const tz = info?.group.timezone;
  const slot = tz ? currentSlot(now, tz) : null;
  const offHours = info && slot ? !inWindow(slot.hour, info.group.firstHour, info.group.lastHour) : false;
  const mirrored = facing === "user" && !fake;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      <video
        ref={liveRef}
        muted
        playsInline
        autoPlay
        className={cx("absolute inset-0 size-full object-cover", mirrored && "-scale-x-100", (phase === "review" || phase === "uploading") && "invisible")}
      />

      {clip && (phase === "review" || phase === "uploading") ? (
        <video src={clip.url} autoPlay loop muted playsInline className="absolute inset-0 size-full object-cover" />
      ) : null}

      <div className="safe-top absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pb-6">
        <Link href={`/g/${id}`} aria-label="Close" className="grid size-11 place-items-center rounded-full bg-black/40">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <div className="text-center leading-tight">
          <p className="text-lg font-semibold">{slot ? formatHour(slot.hour) : "…"}</p>
          <p className="text-xs text-white/70">
            {info?.group.name}
            {tz ? ` · ${cityName(tz)}` : ""}
            {fake ? " · dev camera" : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Flip camera"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          disabled={phase !== "live"}
          className="grid size-11 place-items-center rounded-full bg-black/40 disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7h-3l-2-3H9L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" />
            <path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2" />
          </svg>
        </button>
      </div>

      <div className="safe-bottom absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10">
        {offHours && phase === "live" ? (
          <p className="text-center text-sm text-white/80">Outside drop hours, but it still goes into today&apos;s vlog.</p>
        ) : null}
        <ErrorText>{error}</ErrorText>

        {phase === "starting" ? (
          <div className="grid h-24 place-items-center">
            <Spinner />
          </div>
        ) : null}

        {phase === "live" || phase === "recording" ? (
          <div className="flex h-28 items-center justify-center">
            <button
              type="button"
              aria-label="Record 2.5 seconds"
              onClick={record}
              className="relative grid size-22 place-items-center rounded-full"
            >
              <svg viewBox="0 0 88 88" className="absolute inset-0 -rotate-90">
                <circle cx="44" cy="44" r="40" fill="none" stroke="white" strokeWidth="5" opacity="0.9" />
                <circle
                  cx="44"
                  cy="44"
                  r="40"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="5"
                  strokeDasharray={`${progress * 251.3} 251.3`}
                />
              </svg>
              <span
                className={cx(
                  "bg-accent transition-all",
                  phase === "recording" ? "size-9 rounded-lg" : "size-16 rounded-full",
                )}
              />
            </button>
          </div>
        ) : null}

        {phase === "review" || phase === "uploading" ? (
          <div className="flex flex-col gap-3 pb-1">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={60}
              placeholder="Add a caption (optional)"
              className="h-12 rounded-xl border border-white/20 bg-black/50 px-3 text-white placeholder:text-white/50 outline-none"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={retake} disabled={phase === "uploading"} className="bg-black/50">
                Retake
              </Button>
              <Button onClick={post} busy={phase === "uploading"}>
                Post
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "fallback" ? (
          <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-accent font-semibold text-accent-ink">
            Open iPhone camera
            <input type="file" accept="video/*" capture="user" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        ) : null}
      </div>
    </div>
  );
}
