"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { memberColor, type DayClip } from "@/lib/client";
import { formatHour } from "@/lib/time";
import { Button, Spinner, cx } from "./ui";

export type Slot = { hour: number; clips: DayClip[] };

const MIN_SLOT_MS = 1500;
const MAX_SLOT_MS = 3200;
// How many hours after the current one to download in advance.
const LOOKAHEAD = 2;

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

/**
 * Downloads clips into memory a few hours ahead of playback. iPhones ignore video preload
 * hints, so streaming each clip when its hour starts spent half the hour loading.
 */
function useClipCache(slots: Slot[], index: number) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const created = useRef<string[]>([]);

  useEffect(() => {
    for (const clip of slots.slice(index, index + LOOKAHEAD + 1).flatMap((s) => s.clips)) {
      if (requested.current.has(clip.id)) continue;
      requested.current.add(clip.id);
      fetch(clip.url)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          created.current.push(url);
          return url;
        })
        // If the download fails, stream it directly rather than skipping the clip.
        .catch(() => clip.url)
        .then((url) => setUrls((prev) => ({ ...prev, [clip.id]: url })));
    }
  }, [slots, index]);

  useEffect(() => {
    const list = created.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  return urls;
}

function slotMs(slot: Slot) {
  const longest = Math.max(0, ...slot.clips.map((c) => c.durationMs ?? 0));
  return Math.min(MAX_SLOT_MS, Math.max(MIN_SLOT_MS, longest || 2500));
}

type TileProps = {
  clip: DayClip;
  src: string;
  active: boolean;
  muted: boolean;
  paused: boolean;
  width: number;
  height: number;
  onDecoded: () => void;
  onPlaying: () => void;
};

function Tile({ clip, src, active, muted, paused, width, height, onDecoded, onPlaying }: TileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!active) {
      // The next hour waits invisibly behind this one. Starting and stopping it once makes
      // the phone decode the first frame now, so the cut to it is instant (iOS ignores preload).
      v.muted = true;
      v.play()
        .then(() => {
          v.pause();
          v.currentTime = 0;
        })
        .catch(() => {});
      return;
    }
    v.muted = muted;
    if (paused) v.pause();
    // iOS may refuse to start a video with sound; fall back to silent rather than freezing.
    else
      v.play().catch(() => {
        v.muted = true;
        void v.play().catch(() => {});
      });
  }, [active, muted, paused]);
  return (
    <div className="relative shrink-0 overflow-hidden rounded-md bg-neutral-950" style={{ width, height }}>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload="auto"
        onLoadedData={onDecoded}
        onPlaying={() => active && onPlaying()}
        className="absolute inset-0 size-full object-contain"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
        <p className="truncate text-xs font-semibold" style={{ color: memberColor(clip.userId) }}>
          {clip.userName}
        </p>
        {clip.caption ? <p className="truncate text-xs text-white/90">{clip.caption}</p> : null}
      </div>
    </div>
  );
}

type GridProps = {
  slot: Slot;
  urls: Record<string, string>;
  active: boolean;
  muted: boolean;
  paused: boolean;
  stage: { w: number; h: number };
  onStarted: () => void;
};

/** One hour's split screen. The current hour is shown; the next one is mounted hidden behind it. */
function HourGrid({ slot, urls, active, muted, paused, stage, onStarted }: GridProps) {
  const playing = useRef(new Set<string>());
  const decodedIds = useRef(new Set<string>());
  // Stay invisible until every tile has a picture, so an hour never shows black boxes.
  const [decoded, setDecoded] = useState(false);
  const { cols, tileW, tileH } = layout(slot.clips.length, stage.w, stage.h);
  if (tileW <= 0) return null;
  const report = (id: string) => {
    playing.current.add(id);
    if (playing.current.size >= slot.clips.length) onStarted();
  };
  const reportDecoded = (id: string) => {
    decodedIds.current.add(id);
    if (decodedIds.current.size >= slot.clips.length) setDecoded(true);
  };
  return (
    <div className={cx("absolute inset-0 flex items-center justify-center", !(active && decoded) && "pointer-events-none opacity-0")}>
      <div className="flex flex-wrap content-center justify-center" style={{ width: cols * tileW + (cols - 1) * GAP, gap: GAP }}>
        {slot.clips.map((c) => (
          <Tile
            key={c.id}
            clip={c}
            src={urls[c.id]}
            active={active}
            muted={muted}
            paused={paused}
            width={tileW}
            height={tileH}
            onDecoded={() => reportDecoded(c.id)}
            onPlaying={() => report(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

type Gesture = { x: number; y: number; held: boolean; timer?: ReturnType<typeof setTimeout> };

export function VlogPlayer({ slots, startIndex, title, backHref }: { slots: Slot[]; startIndex: number; title: string; backHref: string }) {
  const router = useRouter();
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  // Index of the hour whose videos are actually playing; its timer only runs from then on.
  const [startedIndex, setStartedIndex] = useState<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [stageRef, stage] = useBoxSize();
  const urls = useClipCache(slots, index);

  const slot = slots[index];
  const duration = slot ? slotMs(slot) : 0;
  const isLoaded = (i: number) => i < slots.length && slots[i].clips.every((c) => urls[c.id]);
  // An hour only appears once every clip in it is downloaded, so nothing begins half-loaded.
  const ready = Boolean(slot) && isLoaded(index);
  const started = ready && startedIndex === index;

  const next = useCallback(() => {
    if (index + 1 >= slots.length) setEnded(true);
    else setIndex(index + 1);
  }, [index, slots.length]);

  const prev = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!started || paused || ended) return;
    const t = setTimeout(next, duration);
    return () => clearTimeout(t);
  }, [index, started, paused, ended, duration, next]);

  // Safety net: if a phone never reports "playing", start the hour anyway.
  useEffect(() => {
    if (!ready || started || ended) return;
    const t = setTimeout(() => setStartedIndex(index), 1500);
    return () => clearTimeout(t);
  }, [index, ready, started, ended]);

  // Tap right = next hour, tap left = previous, hold = pause,
  // swipe left/right = next/previous hour, swipe down = close.
  function onPointerDown(e: React.PointerEvent) {
    const g: Gesture = { x: e.clientX, y: e.clientY, held: false };
    g.timer = setTimeout(() => {
      g.held = true;
      setPaused(true);
    }, 220);
    gesture.current = g;
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (g && !g.held && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) clearTimeout(g.timer);
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    clearTimeout(g.timer);
    if (g.held) return setPaused(false);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (dy > 90 && dy > Math.abs(dx)) return router.push(backHref);
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? next() : prev();
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      if (e.clientX / window.innerWidth < 0.3) prev();
      else next();
    }
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

  const people = new Set(slots.flatMap((s) => s.clips.map((c) => c.userId))).size;
  const clipCount = slots.reduce((n, s) => n + s.clips.length, 0);

  return (
    <div data-no-edge-swipe className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      <div
        ref={stageRef}
        className="absolute inset-x-1 bottom-[max(env(safe-area-inset-bottom),8px)] top-[calc(max(env(safe-area-inset-top),12px)+64px)] flex items-center justify-center"
        style={{ touchAction: "none" }}
        onPointerDown={ended ? undefined : onPointerDown}
        onPointerMove={ended ? undefined : onPointerMove}
        onPointerUp={ended ? undefined : onPointerUp}
        onPointerCancel={() => {
          clearTimeout(gesture.current?.timer);
          gesture.current = null;
        }}
      >
        {!ended
          ? [index, index + 1].filter(isLoaded).map((i) => (
              <HourGrid
                key={i}
                slot={slots[i]}
                urls={urls}
                active={i === index}
                muted={muted}
                paused={paused}
                stage={stage}
                onStarted={() => setStartedIndex(i)}
              />
            ))
          : null}
        {!ended ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
            <div className="rounded-full bg-black/70 px-4 py-1.5 font-mono text-lg font-semibold tabular-nums backdrop-blur">
              {formatHour(slot.hour)}
            </div>
            {/* Only if the wait is noticeable: a normal cut to the next hour takes a few ms. */}
            {!started ? (
              <span style={{ animation: "dv-fade-in 0.2s 0.35s both" }}>
                <Spinner className="text-white/70" />
              </span>
            ) : null}
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
                setStartedIndex(null);
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
          <div className="safe-top pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8">
            <div className="flex gap-1">
              {slots.map((s, i) => (
                <div key={s.hour} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
                  <div
                    key={i === index ? `run-${index}` : i}
                    className={cx("h-full bg-white", i < index && "w-full", i > index && "w-0")}
                    style={
                      i === index
                        ? {
                            animation: `dv-progress ${duration}ms linear forwards`,
                            animationPlayState: paused || !started ? "paused" : "running",
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
          <style>{`@keyframes dv-progress { from { width: 0 } to { width: 100% } } @keyframes dv-fade-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </>
      )}
    </div>
  );
}
