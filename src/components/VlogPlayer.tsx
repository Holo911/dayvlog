"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { memberColor, type DayClip } from "@/lib/client";
import { formatHour } from "@/lib/time";
import { Button, cx } from "./ui";

export type Slot = { hour: number; clips: DayClip[] };

const MIN_SLOT_MS = 1500;
const MAX_SLOT_MS = 3200;

const GAP = 2;
// Clips are recorded 3:4 (width:height). Tiles keep that shape so nobody gets cropped:
// what you framed while recording is exactly what your friends see.
const TILE_ASPECT = 3 / 4;

/** Columns × rows that show n whole clips as large as possible in a w × h stage. */
function layout(n: number, w: number, h: number) {
  let best = { cols: 1, tileW: 0, tileH: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tileW = Math.min((w - GAP * (cols - 1)) / cols, ((h - GAP * (rows - 1)) / rows) * TILE_ASPECT);
    if (tileW > best.tileW) best = { cols, tileW, tileH: tileW / TILE_ASPECT };
  }
  return best;
}

function useBoxSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

function slotMs(slot: Slot) {
  const longest = Math.max(0, ...slot.clips.map((c) => c.durationMs ?? 0));
  return Math.min(MAX_SLOT_MS, Math.max(MIN_SLOT_MS, longest || 2500));
}

function Tile({ clip, muted, paused, width, height }: { clip: DayClip; muted: boolean; paused: boolean; width: number; height: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    if (paused) v.pause();
    // iOS may refuse to start a video with sound; fall back to silent rather than freezing.
    else v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, [muted, paused]);
  return (
    <div className="relative shrink-0 overflow-hidden rounded-md bg-neutral-950" style={{ width, height }}>
      <video ref={ref} src={clip.url} muted playsInline autoPlay preload="auto" className="absolute inset-0 size-full object-contain" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
        <p className="truncate text-xs font-semibold" style={{ color: memberColor(clip.userId) }}>
          {clip.userName}
        </p>
        {clip.caption ? <p className="truncate text-xs text-white/90">{clip.caption}</p> : null}
      </div>
    </div>
  );
}

export function VlogPlayer({ slots, startIndex, title, backHref }: { slots: Slot[]; startIndex: number; title: string; backHref: string }) {
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; held: boolean }>({ held: false });
  const [stageRef, stage] = useBoxSize();

  const slot = slots[index];
  const nextSlot = slots[index + 1];
  const duration = slot ? slotMs(slot) : 0;

  const next = useCallback(() => {
    if (index + 1 >= slots.length) setEnded(true);
    else setIndex(index + 1);
  }, [index, slots.length]);

  useEffect(() => {
    if (paused || ended || !slot) return;
    const t = setTimeout(next, duration);
    return () => clearTimeout(t);
  }, [index, paused, ended, slot, duration, next]);

  function onPointerDown() {
    hold.current.held = false;
    hold.current.timer = setTimeout(() => {
      hold.current.held = true;
      setPaused(true);
    }, 220);
  }

  function onPointerUp(e: React.PointerEvent) {
    clearTimeout(hold.current.timer);
    if (hold.current.held) return setPaused(false);
    if (e.clientX / window.innerWidth < 0.3) setIndex((i) => Math.max(0, i - 1));
    else next();
  }

  if (!slots.length) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-black p-6 text-center">
        <div className="flex flex-col gap-4">
          <p className="text-lg">No clips on this day.</p>
          <Link href={backHref} className="text-muted underline">
            Back
          </Link>
        </div>
      </div>
    );
  }

  const { cols, tileW, tileH } = layout(slot.clips.length, stage.w, stage.h);
  const people = new Set(slots.flatMap((s) => s.clips.map((c) => c.userId))).size;
  const clipCount = slots.reduce((n, s) => n + s.clips.length, 0);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      <div
        ref={stageRef}
        className="absolute inset-x-1 bottom-[max(env(safe-area-inset-bottom),8px)] top-[calc(max(env(safe-area-inset-top),12px)+64px)] flex items-center justify-center"
        onPointerDown={ended ? undefined : onPointerDown}
        onPointerUp={ended ? undefined : onPointerUp}
        onPointerCancel={() => clearTimeout(hold.current.timer)}
      >
        {!ended && tileW > 0 ? (
          <div
            key={index}
            className="flex flex-wrap content-center justify-center"
            style={{ width: cols * tileW + (cols - 1) * GAP, gap: GAP }}
          >
            {slot.clips.map((c) => (
              <Tile key={c.id} clip={c} muted={muted} paused={paused} width={tileW} height={tileH} />
            ))}
          </div>
        ) : null}
        {!ended ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-4 py-1.5 font-mono text-lg font-semibold tabular-nums backdrop-blur">
            {formatHour(slot.hour)}
          </div>
        ) : null}
      </div>

      {ended ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black p-8 text-center">
          <p className="text-3xl font-bold">That&apos;s the day</p>
          <p className="text-white/70">
            {title} · {clipCount} clips from {people} {people === 1 ? "person" : "people"}
          </p>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <Button
              onClick={() => {
                setIndex(0);
                setEnded(false);
              }}
            >
              Replay
            </Button>
            <Link href={backHref} className="py-2 text-white/70 underline underline-offset-4">
              Back
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Warm the next hour's videos so the cut is instant. */}
          <div className="hidden" aria-hidden>
            {nextSlot?.clips.map((c) => <video key={c.id} src={c.url} preload="auto" muted playsInline />)}
          </div>

          <div className="safe-top pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8">
            <div className="flex gap-1">
              {slots.map((s, i) => (
                <div key={s.hour} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
                  <div
                    className={cx("h-full bg-white", i < index && "w-full", i > index && "w-0")}
                    style={
                      i === index
                        ? {
                            animation: `dv-progress ${duration}ms linear forwards`,
                            animationPlayState: paused ? "paused" : "running",
                          }
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
            <div className="pointer-events-auto mt-2 flex items-center justify-between">
              <Link href={backHref} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-black/40">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </Link>
              <p className="text-sm font-semibold">{title}</p>
              <button
                type="button"
                aria-label={muted ? "Sound on" : "Sound off"}
                onClick={() => setMuted((m) => !m)}
                className="grid size-10 place-items-center rounded-full bg-black/40"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H3v6h3l5 4V5z" />
                  {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
                </svg>
              </button>
            </div>
          </div>
          <style>{`@keyframes dv-progress { from { width: 0 } to { width: 100% } }`}</style>
        </>
      )}
    </div>
  );
}
