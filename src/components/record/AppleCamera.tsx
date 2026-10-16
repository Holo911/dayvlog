"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorText, Spinner } from "@/components/ui";
import { pickMime, setCameraMode } from "@/lib/camera";
import { useNow, type GroupInfo } from "@/lib/client";
import { cityName, currentSlot, formatHour, inWindow } from "@/lib/time";
import { uploadClip } from "@/lib/upload";
import { TrimStrip } from "./TrimStrip";

// Records with Apple's own camera (a file input with `capture`). iOS never asks a Home Screen
// web app for camera permission this way, unlike the live in-app camera. The app never opens
// the camera itself here: holding it while Apple's camera opens froze that on a blurred frame.
// Afterwards you pick 2.5 s of the video, and the app re-records exactly that part into a
// 3:4 clip (canvas + MediaRecorder), so it matches everyone else's clips.

const CLIP_S = 2.5;
const OUT_W = 720;
const OUT_H = 960;
const MAX_RAW_BYTES = 25 * 1024 * 1024;

type Picked = { url: string; file: File; duration: number };
type Clip = { blob: Blob; url: string; durationMs: number };
type Phase = "pick" | "loading" | "trim" | "rendering" | "review" | "uploading";

function CameraIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

export function AppleCamera({ groupId, info }: { groupId: string; info: GroupInfo | null }) {
  const router = useRouter();
  const now = useNow(10_000);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<{ ac: AudioContext; dest: MediaStreamAudioDestinationNode } | null>(null);
  const looping = useRef(true);
  const [phase, setPhase] = useState<Phase>("pick");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [start, setStart] = useState(0);
  const [progress, setProgress] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      void audioRef.current?.ac.close();
    },
    [],
  );

  function reset() {
    if (picked) URL.revokeObjectURL(picked.url);
    if (clip) URL.revokeObjectURL(clip.url);
    void audioRef.current?.ac.close();
    audioRef.current = null;
    looping.current = true;
    setPicked(null);
    setClip(null);
    setCaption("");
    setStart(0);
    setError(null);
    setPhase("pick");
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPhase("loading");
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    probe.onloadedmetadata = () => {
      setPicked({ url, file, duration: probe.duration || 0 });
      // Start near the middle of short videos: the first moment is usually you tapping record.
      setStart(probe.duration > CLIP_S ? Math.min(0.5, probe.duration - CLIP_S) : 0);
      setPhase("trim");
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That video couldn't be opened. Try recording again.");
      setPhase("pick");
    };
    probe.src = url;
  }

  // While trimming, the preview loops just the chosen 2.5 s.
  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v || !looping.current || !picked) return;
    if (v.currentTime >= start + CLIP_S || v.currentTime < start - 0.1) v.currentTime = start;
  }

  function onSlide(value: number) {
    setStart(value);
    const v = videoRef.current;
    if (v) v.currentTime = value;
  }

  /** Re-records the chosen 2.5 s into a 3:4 clip. Must start inside the tap (iOS audio rules). */
  function keepSegment() {
    const v = videoRef.current;
    if (!v || !picked) return;
    const mimeType = pickMime();
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!mimeType || !ctx || typeof canvas.captureStream !== "function" || !v.videoWidth) {
      void keepOriginal();
      return;
    }

    // Route the video's sound into the recording (not to the speaker). Created once per video.
    if (!audioRef.current) {
      try {
        const ac = new AudioContext();
        const source = ac.createMediaElementSource(v);
        const dest = ac.createMediaStreamDestination();
        source.connect(dest);
        audioRef.current = { ac, dest };
      } catch {
        audioRef.current = null;
      }
    }
    void audioRef.current?.ac.resume();

    const stream = canvas.captureStream(30);
    audioRef.current?.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Centre crop to 3:4, the same framing the trim preview shows.
    const scale = Math.max(OUT_W / v.videoWidth, OUT_H / v.videoHeight);
    const sw = OUT_W / scale;
    const sh = OUT_H / scale;
    const sx = (v.videoWidth - sw) / 2;
    const sy = (v.videoHeight - sh) / 2;
    const draw = () => ctx.drawImage(v, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

    const length = Math.min(CLIP_S, picked.duration - start);
    const end = start + length;
    let t0 = 0;
    recorder.onstop = () => {
      v.pause();
      v.muted = true;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      setClip({ blob, url: URL.createObjectURL(blob), durationMs: Math.round(performance.now() - t0) });
      setPhase("review");
    };

    looping.current = false;
    v.muted = !audioRef.current;
    setProgress(0);
    setPhase("rendering");
    v.addEventListener(
      "seeked",
      () => {
        void v.play().catch(() => {});
        draw();
        recorder.start();
        t0 = performance.now();
        const tick = () => {
          draw();
          setProgress(Math.min(1, (v.currentTime - start) / length));
          if (v.currentTime >= end || v.ended) {
            if (recorder.state === "recording") recorder.stop();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { once: true },
    );
    v.currentTime = start;
  }

  /** Fallback when this browser can't re-record: post the video as filmed (it plays ~3 s). */
  async function keepOriginal() {
    if (!picked) return;
    if (picked.file.size > MAX_RAW_BYTES) {
      setError("That video is too long. Record just a few seconds.");
      return;
    }
    setClip({ blob: picked.file, url: picked.url, durationMs: Math.min(picked.duration, 3.2) * 1000 });
    setPhase("review");
  }

  async function post() {
    if (!clip) return;
    setPhase("uploading");
    setError(null);
    try {
      await uploadClip(groupId, clip.blob, clip.durationMs, caption);
      router.replace(`/g/${groupId}`);
    } catch (err) {
      setError((err as Error).message);
      setPhase("review");
    }
  }

  const tz = info?.group.timezone;
  const slot = tz ? currentSlot(now, tz) : null;
  const offHours = info && slot ? !inWindow(slot.hour, info.group.firstHour, info.group.lastHour) : false;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-black text-white">
      <div className="safe-top flex items-center justify-between px-3 pb-3">
        <Link href={`/g/${groupId}`} aria-label="Close" className="grid size-11 place-items-center rounded-full bg-white/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <div className="text-center leading-tight">
          <p className="text-lg font-semibold">{slot ? formatHour(slot.hour) : "…"}</p>
          <p className="text-xs text-white/70">
            {info?.group.name}
            {tz ? ` · ${cityName(tz)}` : ""}
          </p>
        </div>
        <span className="size-11" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
        {phase === "pick" ? (
          <>
            <label className="grid size-32 cursor-pointer place-items-center rounded-full bg-accent text-accent-ink shadow-lg active:scale-95">
              <span className="flex flex-col items-center gap-1 text-sm font-semibold">
                <CameraIcon />
                Open camera
              </span>
              <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <p className="max-w-64 text-center text-sm text-white/70">
              Film a few seconds, then tap <b className="text-white">Use Video</b>. You&apos;ll pick the best 2.5 s next.
            </p>
            <label className="cursor-pointer rounded-full border border-white/20 px-4 py-2 text-sm">
              Selfie camera
              <input type="file" accept="video/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {offHours ? <p className="text-center text-xs text-white/60">Outside drop hours, but it still goes into today&apos;s vlog.</p> : null}
          </>
        ) : null}

        {phase === "loading" ? <Spinner /> : null}

        {picked && (phase === "trim" || phase === "rendering") ? (
          <div className="relative aspect-[3/4] max-h-[60dvh] w-full max-w-sm overflow-hidden rounded-2xl bg-neutral-900">
            <video
              key={picked.url}
              ref={videoRef}
              src={picked.url}
              autoPlay
              muted
              playsInline
              onTimeUpdate={onTimeUpdate}
              onEnded={(e) => {
                if (looping.current) {
                  e.currentTarget.currentTime = start;
                  void e.currentTarget.play().catch(() => {});
                }
              }}
              className="absolute inset-0 size-full object-cover"
            />
            {phase === "rendering" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50">
                <p className="text-sm font-semibold">Preparing your clip…</p>
                <div className="h-1 w-40 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {clip && (phase === "review" || phase === "uploading") ? (
          <div className="relative aspect-[3/4] max-h-[60dvh] w-full max-w-sm overflow-hidden rounded-2xl bg-neutral-900">
            <video src={clip.url} autoPlay loop muted playsInline className="absolute inset-0 size-full object-cover" />
          </div>
        ) : null}
      </div>

      <div className="safe-bottom flex flex-col gap-3 px-4 pt-3">
        <ErrorText>{error}</ErrorText>

        {phase === "trim" && picked ? (
          <>
            <TrimStrip url={picked.url} duration={picked.duration} length={CLIP_S} start={start} onChange={onSlide} videoRef={videoRef} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset} className="bg-white/10">
                Retake
              </Button>
              <Button onClick={keepSegment}>Use this</Button>
            </div>
          </>
        ) : null}

        {phase === "review" || phase === "uploading" ? (
          <>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={60}
              placeholder="Add a caption (optional)"
              className="h-12 rounded-xl border border-white/20 bg-black/50 px-3 text-white outline-none placeholder:text-white/50"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset} disabled={phase === "uploading"} className="bg-white/10">
                Retake
              </Button>
              <Button onClick={post} busy={phase === "uploading"}>
                Post
              </Button>
            </div>
          </>
        ) : null}

        {phase === "pick" ? (
          <button type="button" onClick={() => setCameraMode("inapp")} className="self-center pb-1 text-xs text-white/60 underline underline-offset-4">
            Use the in-app camera instead
          </button>
        ) : null}
      </div>
    </div>
  );
}
