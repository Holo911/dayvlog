"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorText, Spinner, cx } from "@/components/ui";
import { describeTrack, openCamera, pickMime, quickZooms, setCameraMode, setZoom, zoomRange, type Facing } from "@/lib/camera";
import { useNow, type GroupInfo } from "@/lib/client";
import { cityName, currentSlot, formatHour, inWindow } from "@/lib/time";
import { uploadClip } from "@/lib/upload";

// The in-app camera: live preview, 2.5 s auto-stop, zoom presets. On iPhone, Home Screen web
// apps can't keep camera permission, so this asks for it again most times; the Apple camera
// mode (AppleCamera.tsx) avoids that.

const CLIP_MS = 2500;
const ZOOM_ANIMATION_MS = 180;

type Clip = { blob: Blob; url: string; durationMs: number };
type Phase = "starting" | "live" | "recording" | "review" | "uploading" | "fallback";

/** Dev-only stand-in when there's no camera (e.g. the desktop preview browser). 3:4 like an iPhone. */
function fakeCameraStream() {
  const W = 720;
  const H = 960;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${(t * 40) % 360} 70% 45%)`);
    g.addColorStop(1, `hsl(${(t * 40 + 120) % 360} 70% 25%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("dev camera", W / 2, H / 2 - 40);
    ctx.font = "48px monospace";
    ctx.fillText(new Date().toLocaleTimeString(), W / 2, H / 2 + 40);
    ctx.beginPath();
    ctx.arc(W / 2 + Math.sin(t * 3) * 220, H * 0.75, 60, 0, Math.PI * 2);
    ctx.fill();
    if (track.readyState === "live") requestAnimationFrame(draw);
  };
  draw();
  return stream;
}

function cameraError(err: unknown) {
  const name = (err as Error)?.name;
  if (name === "NotAllowedError") return "Camera access is blocked. You can use the iPhone camera instead.";
  if (name === "NotFoundError") return "No camera found on this device.";
  return "The in-app camera didn't start. You can still use the iPhone camera.";
}

export function InAppCamera({ groupId: id, info }: { groupId: string; info: GroupInfo | null }) {
  const router = useRouter();
  const now = useNow(10_000);

  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const zoomAnimation = useRef(0);
  const [facing, setFacing] = useState<Facing>("user");
  const [restartKey, setRestartKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [fake, setFake] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoomValue] = useState(1);
  const [cameraInfo, setCameraInfo] = useState("");
  const [showInfo, setShowInfo] = useState(false);
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
      const track = stream.getVideoTracks()[0];
      const caps = zoomRange(track);
      setZoomCaps(caps);
      // iPhone's back "Dual Wide" camera reports zoom 0.5–10 and starts at the 1× lens.
      setZoomValue((track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? 1);
      setCameraInfo(describeTrack(track));
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => {});
      }
      setPhase((p) => (p === "review" ? p : "live"));
    })();
    return () => {
      cancelled = true;
    };
  }, [facing, restartKey, stopStream]);

  useEffect(
    () => () => {
      cancelAnimationFrame(zoomAnimation.current);
      stopStream();
    },
    [stopStream],
  );

  const liveTrack = () => streamRef.current?.getVideoTracks()[0];

  function applyZoom(value: number) {
    const track = liveTrack();
    if (!track || !zoomCaps) return;
    const z = Math.min(zoomCaps.max, Math.max(zoomCaps.min, value));
    setZoomValue(z);
    void setZoom(track, z).catch(() => {});
  }

  /** The 0.5× / 1× / 2× buttons: a quick glide like the iPhone camera, no camera restart. */
  function glideTo(target: number) {
    cancelAnimationFrame(zoomAnimation.current);
    const from = zoom;
    let t0: number | null = null;
    const step = (t: number) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / ZOOM_ANIMATION_MS);
      applyZoom(from + (target - from) * (1 - (1 - p) ** 2));
      if (p < 1) zoomAnimation.current = requestAnimationFrame(step);
    };
    zoomAnimation.current = requestAnimationFrame(step);
  }

  const distance = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2 && zoomCaps) {
      cancelAnimationFrame(zoomAnimation.current);
      pinch.current = { dist: distance(e.touches), zoom };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!pinch.current || e.touches.length !== 2) return;
    applyZoom(pinch.current.zoom * (distance(e.touches) / pinch.current.dist));
  }

  function flip() {
    setFacing((f) => (f === "user" ? "environment" : "user"));
  }

  function record() {
    const stream = streamRef.current;
    if (!stream || phase !== "live") return;
    const mimeType = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
    } catch {
      setError("This phone can't record in the app. Use the iPhone camera instead.");
      stopStream();
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
    if (liveTrack()?.readyState === "live") setPhase("live");
    else {
      setPhase("starting");
      setRestartKey((k) => k + 1);
    }
  }

  async function post() {
    if (!clip) return;
    setPhase("uploading");
    setError(null);
    try {
      await uploadClip(id, clip.blob, clip.durationMs, caption);
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
  const presets = zoomCaps ? quickZooms(zoomCaps) : [];
  // The highlighted preset is the one you're at or just past, labelled with the exact zoom (like iOS).
  const activePreset = presets.filter((z) => z <= zoom + 0.01).pop() ?? presets[0];

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-white"
      style={{ touchAction: "none" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => (pinch.current = null)}
    >
      {/* Show the whole frame, exactly what gets recorded and what friends will see. */}
      <video
        ref={liveRef}
        muted
        playsInline
        autoPlay
        className={cx("absolute inset-0 size-full object-contain", mirrored && "-scale-x-100", (phase === "review" || phase === "uploading") && "invisible")}
      />

      {clip && (phase === "review" || phase === "uploading") ? (
        <video src={clip.url} autoPlay loop muted playsInline className="absolute inset-0 size-full object-contain" />
      ) : null}

      <div className="safe-top absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pb-6">
        <Link href={`/g/${id}`} aria-label="Close" className="grid size-11 place-items-center rounded-full bg-black/40">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <button type="button" onClick={() => setShowInfo((v) => !v)} className="text-center leading-tight">
          <p className="text-lg font-semibold">{slot ? formatHour(slot.hour) : "…"}</p>
          <p className="text-xs text-white/70">
            {info?.group.name}
            {tz ? ` · ${cityName(tz)}` : ""}
            {fake ? " · dev camera" : ""}
          </p>
          {showInfo && cameraInfo ? <p className="mt-1 max-w-56 break-all text-[10px] text-white/60">{cameraInfo}</p> : null}
        </button>
        <button
          type="button"
          aria-label="Flip camera"
          onClick={flip}
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

        {(phase === "live" || phase === "recording") && presets.length > 1 ? (
          <div className="flex items-center justify-center gap-2">
            {presets.map((z) => {
              const active = z === activePreset;
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => glideTo(z)}
                  className={cx(
                    "grid h-9 min-w-9 place-items-center rounded-full px-2 text-xs font-semibold tabular-nums transition",
                    active ? "bg-white/90 text-black" : "bg-black/50 text-white",
                  )}
                >
                  {active && Math.abs(zoom - z) > 0.05 ? `${zoom.toFixed(1)}×` : `${z}×`}
                </button>
              );
            })}
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
          <Button onClick={() => setCameraMode("apple")}>Use the iPhone camera</Button>
        ) : null}
        {phase === "live" ? (
          <button
            type="button"
            onClick={() => {
              // Release the camera first: Apple's camera can't start while we hold it.
              stopStream();
              setCameraMode("apple");
            }}
            className="self-center pb-1 text-xs text-white/70 underline underline-offset-4"
          >
            Use the iPhone camera instead (no permission prompts)
          </button>
        ) : null}
      </div>
    </div>
  );
}
