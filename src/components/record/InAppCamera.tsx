"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Button, ErrorText, Spinner, cx } from "@/components/ui";
import { describeTrack, openCamera, quickZooms, setTorch, setZoom, torchSupported, zoomRange, type Facing } from "@/lib/camera";
import { createClipRecorder } from "@/lib/clipFormat";
import { useNow, type GroupInfo } from "@/lib/client";
import { cityName, currentSlot, formatHour, inWindow } from "@/lib/time";
import { uploadClip } from "@/lib/upload";

// The camera: you film holding the phone sideways, like the original app. The viewfinder
// fills the screen and shows exactly what gets recorded: a horizontal 16:9 clip of exactly
// 2.5 s (see lib/clipFormat.ts). When the page itself stays portrait (rotation lock, or the
// OS not rotating web apps), the controls are drawn rotated a quarter turn so they read
// upright with the phone's top to the left. Caption and posting happen upright again.
// On iPhone, Home Screen web apps can't keep camera permission, so iOS asks again most times.

const CLIP_MS = 2500;
const ZOOM_ANIMATION_MS = 180;
// Front "flash": the screen turns warm white this long before recording, so the camera's
// exposure has settled on the lit face when the clip starts.
const SCREEN_FLASH_LEAD_MS = 350;

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
  if (name === "NotAllowedError") return "Camera access was not allowed. Tap Try again and choose Allow.";
  if (name === "NotFoundError") return "No camera found on this device.";
  return "The camera didn't start. Close other apps using the camera and try again.";
}

const landscapeQuery = "(orientation: landscape)";
function subscribeOrientation(listener: () => void) {
  const mq = window.matchMedia(landscapeQuery);
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

function IconButton({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cx("grid size-11 place-items-center rounded-full disabled:opacity-40", active ? "bg-yellow-300 text-black" : "bg-black/45 text-white")}
    >
      {children}
    </button>
  );
}

export function InAppCamera({ groupId: id, info }: { groupId: string; info: GroupInfo | null }) {
  const router = useRouter();
  const now = useNow(10_000);

  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const zoomAnimation = useRef(0);
  const flashRef = useRef(false);
  const [facing, setFacing] = useState<Facing>("user");
  const [restartKey, setRestartKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [fake, setFake] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoomValue] = useState(1);
  const [flash, setFlash] = useState(false);
  const [torch, setTorchAvailable] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [hint, setHint] = useState(true);
  // Whether camera frames arrive landscape. Held sideways with the page portrait, iOS may hand
  // us frames either still matching the screen (portrait: we rotate them) or already turned
  // to match the world (landscape: we don't). Read from the actual frames, so both work.
  const [frameLandscape, setFrameLandscape] = useState(false);
  const [cameraInfo, setCameraInfo] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [progress, setProgress] = useState(0);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Portrait page = phone held sideways with the page not rotating: controls are drawn rotated.
  const landscapePage = useSyncExternalStore(subscribeOrientation, () => window.matchMedia(landscapeQuery).matches, () => false);
  const sideways = !landscapePage;
  // Frames that still match the portrait screen get rotated a quarter turn into the clip.
  const rotateFrames = sideways && !frameLandscape;

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
      // Back camera: the real flash light, if the browser lets us control it.
      const hasTorch = facing === "environment" && torchSupported(track);
      setTorchAvailable(hasTorch);
      if (hasTorch && flashRef.current) void setTorch(track, true).catch(() => {});
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

  // "Turn your phone sideways" shows briefly when the camera opens.
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 2500);
    return () => clearTimeout(t);
  }, []);

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

  function toggleFlash() {
    const on = !flash;
    setFlash(on);
    flashRef.current = on;
    const track = liveTrack();
    if (facing === "environment" && torch && track) void setTorch(track, on).catch(() => {});
  }

  async function record() {
    const stream = streamRef.current;
    const video = liveRef.current;
    if (!stream || !video || phase !== "live") return;
    const rec = createClipRecorder(stream.getAudioTracks());
    if (!rec) {
      setError("This browser can't record video. Update iOS and try again.");
      stopStream();
      setPhase("fallback");
      return;
    }
    const filmingSideways = rotateFrames;
    setPhase("recording");
    if (facing === "user" && flash) {
      setScreenFlash(true);
      await new Promise((r) => setTimeout(r, SCREEN_FLASH_LEAD_MS));
    }
    rec.draw(video, filmingSideways);
    rec.start();
    const t0 = performance.now();
    const tick = () => {
      rec.draw(video, filmingSideways);
      const p = Math.min(1, (performance.now() - t0) / CLIP_MS);
      setProgress(p);
      if (p < 1) requestAnimationFrame(tick);
      else rec.stop();
    };
    requestAnimationFrame(tick);
    void rec.finished.then((blob) => {
      setScreenFlash(false);
      setClip({ blob, url: URL.createObjectURL(blob), durationMs: Math.round(performance.now() - t0) });
      setPhase("review");
      setProgress(0);
    });
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
  const presets = zoomCaps ? quickZooms(zoomCaps) : [];
  // The highlighted preset is the one you're at or just past, labelled with the exact zoom (like iOS).
  const activePreset = presets.filter((z) => z <= zoom + 0.01).pop() ?? presets[0];
  const reviewing = phase === "review" || phase === "uploading";
  const flashAvailable = facing === "user" || torch;
  // Selfie preview is mirrored along the world's left-right axis: the screen's vertical axis
  // when frames match the portrait screen, the frame's own horizontal axis otherwise.
  const selfie = facing === "user" && !fake;
  const videoStyle: CSSProperties =
    sideways && frameLandscape
      ? {
          // Landscape frames on a portrait screen: turn the picture so it's upright sideways.
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${(16 / 9) * 100}%`,
          height: `${(9 / 16) * 100}%`,
          transform: `translate(-50%, -50%) rotate(90deg)${selfie ? " scaleX(-1)" : ""}`,
        }
      : { transform: selfie ? (rotateFrames ? "scaleY(-1)" : "scaleX(-1)") : undefined };

  // The controls layer: a landscape-shaped box, turned a quarter turn when the page is portrait.
  const controlsBox: CSSProperties = sideways
    ? { width: "100dvh", height: "100vw", transform: "translate(-50%, -50%) rotate(90deg)" }
    : { width: "100vw", height: "100dvh", transform: "translate(-50%, -50%)" };
  // Keep controls clear of the notch and home indicator (which sit left/right when sideways).
  const safeBox: CSSProperties = sideways
    ? { left: "max(env(safe-area-inset-top), 12px)", right: "max(env(safe-area-inset-bottom), 12px)", top: 12, bottom: 12 }
    : { left: "max(env(safe-area-inset-left), 12px)", right: "max(env(safe-area-inset-right), 12px)", top: 12, bottom: "max(env(safe-area-inset-bottom), 12px)" };

  const hourLabel = (
    <button type="button" onClick={() => setShowInfo((v) => !v)} className="text-center leading-tight drop-shadow">
      <p className="text-lg font-semibold">{slot ? formatHour(slot.hour) : "…"}</p>
      <p className="text-xs text-white/80">
        {info?.group.name}
        {tz ? ` · ${cityName(tz)}` : ""}
        {fake ? " · dev camera" : ""}
      </p>
      {showInfo && cameraInfo ? <p className="mx-auto mt-1 max-w-64 break-all text-[10px] text-white/70">{cameraInfo}</p> : null}
    </button>
  );

  const closeButton = (
    <Link href={`/g/${id}`} aria-label="Close" className="grid size-11 place-items-center rounded-full bg-black/45">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </Link>
  );

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-white"
      style={{ touchAction: "none" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => (pinch.current = null)}
    >
      {/* Viewfinder: exactly the part of the camera picture that becomes the clip. */}
      <div
        className={cx(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-neutral-900",
          sideways ? "aspect-[9/16] max-h-full w-full" : "aspect-video h-full max-w-full",
          reviewing && "invisible",
        )}
      >
        <video
          ref={liveRef}
          muted
          playsInline
          autoPlay
          onLoadedMetadata={(e) => setFrameLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight)}
          onResize={(e) => setFrameLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight)}
          className="size-full object-cover"
          style={videoStyle}
        />
      </div>

      {/* Front "flash": warm white screen while filming yourself. */}
      {screenFlash ? <div className="pointer-events-none absolute inset-0 z-10 bg-[#fff4e0] opacity-90" /> : null}

      {!reviewing ? (
        <div className="absolute left-1/2 top-1/2 z-20" style={controlsBox}>
          <div className="absolute" style={safeBox}>
            <div className="flex items-start justify-between gap-2">
              {closeButton}
              {hourLabel}
              <div className="flex gap-2">
                {flashAvailable ? (
                  <IconButton label={flash ? "Flash on" : "Flash off"} onClick={toggleFlash} active={flash} disabled={phase === "recording"}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={flash ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
                      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
                    </svg>
                  </IconButton>
                ) : null}
                <IconButton label="Flip camera" onClick={flip} disabled={phase !== "live"}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 7h-3l-2-3H9L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" />
                    <path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2" />
                  </svg>
                </IconButton>
              </div>
            </div>

            {phase === "starting" ? (
              <div className="absolute inset-0 grid place-items-center">
                <Spinner />
              </div>
            ) : null}

            {phase === "fallback" ? (
              <div className="absolute inset-x-0 top-1/2 mx-auto flex max-w-sm -translate-y-1/2 flex-col gap-3">
                <ErrorText>{error}</ErrorText>
                <Button
                  onClick={() => {
                    setError(null);
                    setPhase("starting");
                    setRestartKey((k) => k + 1);
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : null}

            {/* Shutter on the right, where your thumb is when holding the phone sideways. */}
            {phase === "live" || phase === "recording" ? (
              <button
                type="button"
                aria-label="Record 2.5 seconds"
                onClick={record}
                className="absolute right-0 top-1/2 grid size-20 -translate-y-1/2 place-items-center rounded-full"
              >
                <svg viewBox="0 0 88 88" className="absolute inset-0 -rotate-90">
                  <circle cx="44" cy="44" r="40" fill="none" stroke="white" strokeWidth="5" opacity="0.9" />
                  <circle cx="44" cy="44" r="40" fill="none" stroke="var(--color-accent)" strokeWidth="5" strokeDasharray={`${progress * 251.3} 251.3`} />
                </svg>
                <span className={cx("bg-accent transition-all", phase === "recording" ? "size-8 rounded-lg" : "size-14 rounded-full")} />
              </button>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2">
              {offHours && phase === "live" ? <p className="text-xs text-white/80 drop-shadow">Outside drop hours, but it still goes into today&apos;s vlog.</p> : null}
              {(phase === "live" || phase === "recording") && presets.length > 1 ? (
                <div className="flex items-center gap-2">
                  {presets.map((z) => {
                    const active = z === activePreset;
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => glideTo(z)}
                        className={cx(
                          "grid h-9 min-w-9 place-items-center rounded-full px-2 text-xs font-semibold tabular-nums transition",
                          active ? "bg-white/90 text-black" : "bg-black/45 text-white",
                        )}
                      >
                        {active && Math.abs(zoom - z) > 0.05 ? `${zoom.toFixed(1)}×` : `${z}×`}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Shown upright (not rotated) for a moment, telling you how to hold the phone. */}
      {sideways && hint && phase !== "fallback" && !reviewing ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-3xl bg-black/70 px-6 py-5 text-center backdrop-blur">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "dv-turn 1.6s ease-in-out infinite" }} aria-hidden>
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
          <p className="text-sm font-semibold">Turn your phone sideways</p>
          <style>{`@keyframes dv-turn { 0%, 20% { transform: rotate(0) } 60%, 100% { transform: rotate(-90deg) } }`}</style>
        </div>
      ) : null}

      {/* Caption and posting happen upright again, so typing is normal. */}
      {reviewing && clip ? (
        <div className="safe-top safe-bottom absolute inset-0 z-20 flex flex-col bg-black px-4">
          <div className="flex items-center justify-between pb-3">
            {closeButton}
            {hourLabel}
            <span className="size-11" />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-2xl bg-neutral-900">
              <video src={clip.url} autoPlay loop muted playsInline className="absolute inset-0 size-full object-cover" />
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pt-3">
            <ErrorText>{error}</ErrorText>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={60}
              placeholder="Add a caption (optional)"
              className="h-12 rounded-xl border border-white/20 bg-black/50 px-3 text-white outline-none placeholder:text-white/50"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={retake} disabled={phase === "uploading"} className="bg-white/10">
                Retake
              </Button>
              <Button onClick={post} busy={phase === "uploading"}>
                Post
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
