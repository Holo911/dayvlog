"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Instagram-music-style trimmer: a filmstrip of the whole video with a fixed-length window
// you drag along it. The parts outside the window are dimmed, and a playhead follows the
// looping preview, so you can see where your 2.5 s sit in the whole video.

const FRAMES = 10;
const THUMB_W = 64;
const THUMB_H = 96;

/** Small frames spread over the video, drawn as they're ready. */
async function filmstrip(url: string, duration: number, onFrame: (frames: string[]) => void, alive: () => boolean) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  // Kept on the page (invisibly): browsers may skip decoding frames of detached videos.
  v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none";
  document.body.appendChild(v);
  v.src = url;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => {
      v.remove();
      reject(new Error("video"));
    };
  });
  // iPhones only decode frames of a video that has played, so start and stop it once.
  await v.play().catch(() => {});
  v.pause();

  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const frames: string[] = [];
  for (let i = 0; i < FRAMES && alive(); i++) {
    await new Promise<void>((resolve) => {
      v.onseeked = () => resolve();
      v.currentTime = ((i + 0.5) / FRAMES) * duration;
    });
    // Give the new frame a moment to be painted before copying it.
    await new Promise((r) => requestAnimationFrame(r));
    const scale = Math.max(THUMB_W / v.videoWidth, THUMB_H / v.videoHeight);
    const sw = THUMB_W / scale;
    const sh = THUMB_H / scale;
    ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, THUMB_W, THUMB_H);
    frames.push(canvas.toDataURL("image/jpeg", 0.6));
    if (alive()) onFrame([...frames]);
  }
  v.removeAttribute("src");
  v.load();
  v.remove();
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function TrimStrip({
  url,
  duration,
  length,
  start,
  onChange,
  videoRef,
}: {
  url: string;
  duration: number;
  length: number;
  start: number;
  onChange: (start: number) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offset: number } | null>(null);
  const [frames, setFrames] = useState<string[]>([]);

  const windowFrac = duration > 0 ? Math.min(1, length / duration) : 1;
  const startFrac = duration > 0 ? start / duration : 0;
  const maxStart = Math.max(0, duration - length);

  useEffect(() => {
    let live = true;
    filmstrip(url, duration, setFrames, () => live).catch(() => {});
    return () => {
      live = false;
    };
  }, [url, duration]);

  // The playhead follows the looping preview (moved directly, not through React, 60×/s).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const el = playheadRef.current;
      if (v && el && duration > 0) el.style.left = `${clamp(v.currentTime / duration, 0, 1) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, videoRef]);

  const fracAt = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return (clientX - r.left) / r.width;
  };
  const moveTo = (frac: number) => onChange(clamp(frac * duration, 0, maxStart));

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (maxStart <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fracAt(e.clientX);
    // Grab the window where you touched it; touching elsewhere centres the window there.
    const inside = f >= startFrac && f <= startFrac + windowFrac;
    drag.current = { offset: inside ? f - startFrac : windowFrac / 2 };
    if (!inside) moveTo(f - windowFrac / 2);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current) moveTo(fracAt(e.clientX) - drag.current.offset);
  }

  const end = Math.min(duration, start + length);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={stripRef}
        role="slider"
        aria-label="Which 2.5 seconds to keep"
        aria-valuemin={0}
        aria-valuemax={Number(maxStart.toFixed(2))}
        aria-valuenow={Number(start.toFixed(2))}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onChange(clamp(start - 0.1, 0, maxStart));
          if (e.key === "ArrowRight") onChange(clamp(start + 0.1, 0, maxStart));
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative h-16 w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-neutral-800"
      >
        <div className="absolute inset-0 flex">
          {Array.from({ length: FRAMES }, (_, i) => (
            <div
              key={i}
              className="h-full flex-1 bg-neutral-700 bg-cover bg-center"
              style={frames[i] ? { backgroundImage: `url(${frames[i]})` } : undefined}
            />
          ))}
        </div>
        <div className="absolute inset-y-0 left-0 bg-black/65" style={{ width: `${startFrac * 100}%` }} />
        <div className="absolute inset-y-0 right-0 bg-black/65" style={{ width: `${(1 - startFrac - windowFrac) * 100}%` }} />
        <div
          className="absolute inset-y-0 rounded-xl border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${startFrac * 100}%`, width: `${windowFrac * 100}%` }}
        />
        <div ref={playheadRef} className="pointer-events-none absolute inset-y-2 w-0.5 -translate-x-1/2 rounded-full bg-white/90" />
      </div>
      <div className="flex justify-between text-xs tabular-nums text-white/60">
        <span>0.0 s</span>
        <span className="font-semibold text-white">
          {start.toFixed(1)} – {end.toFixed(1)} s
        </span>
        <span>{duration.toFixed(1)} s</span>
      </div>
    </div>
  );
}
