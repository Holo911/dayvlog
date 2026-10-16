"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClipUrls } from "@/lib/clipCache";
import { CLIP_ASPECT } from "@/lib/clipFormat";
import { memberColor, type DayClip } from "@/lib/client";
import { formatHour } from "@/lib/time";
import { Spinner, cx } from "./ui";

export type Slot = { hour: number; clips: DayClip[] };

const MIN_SLOT_MS = 1500;
const MAX_SLOT_MS = 3200;
// How many hours after the current one to download in advance.
const LOOKAHEAD = 2;

export const GAP = 2;
// Clips are horizontal 16:9 (lib/clipFormat.ts).
export const TILE_ASPECT = CLIP_ASPECT;

/**
 * Setlog-style split screen: horizontal clips stacked one above the other, never cropped.
 * Up to 3 people that's full width edge to edge; with more, tiles shrink a little to fit
 * whole, and big groups go to two columns. Picks the column count with the biggest tiles.
 */
export function layout(n: number, w: number, h: number) {
  let best = { cols: 1, tileW: 0, tileH: 0 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const tileW = Math.min((w - GAP * (cols - 1)) / cols, ((h - GAP * (rows - 1)) / rows) * TILE_ASPECT);
    if (tileW > best.tileW) best = { cols, tileW, tileH: tileW / TILE_ASPECT };
  }
  return best;
}

/** Size of an element (no padding on it, please): measured right away, then kept up to date. */
export function useBoxSize() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    // Measure immediately rather than waiting for the first ResizeObserver callback, which
    // only arrives with the next rendered frame.
    const r = el.getBoundingClientRect();
    setBox({ w: r.width, h: r.height });
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
    <div className="relative shrink-0 overflow-hidden bg-neutral-950" style={{ width, height }}>
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
      {/* Name and the whole caption (max 60 characters), wrapped rather than cut off. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-2 pt-8">
        <p className="truncate text-xs font-semibold" style={{ color: memberColor(clip.userId) }}>
          {clip.userName}
        </p>
        {clip.caption ? <p className="line-clamp-3 break-words text-[13px] leading-snug text-white">{clip.caption}</p> : null}
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

export function VlogPlayer({
  slots,
  startIndex,
  groupName,
  dateLabel,
  backHref,
}: {
  slots: Slot[];
  startIndex: number;
  groupName: string;
  dateLabel: string;
  backHref: string;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  // Index of the hour whose videos are actually playing; its timer only runs from then on.
  const [startedIndex, setStartedIndex] = useState<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [stageRef, stage] = useBoxSize();
  // Download this hour and the next ones ahead of time (shared with the group screen preview).
  const wanted = useMemo(() => slots.slice(index, index + LOOKAHEAD + 1).flatMap((s) => s.clips), [slots, index]);
  const urls = useClipUrls(wanted);

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

  // The day is over: go back to the group screen (watching again is one tap on its preview).
  useEffect(() => {
    if (ended) router.replace(backHref);
  }, [ended, router, backHref]);

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

  // Tap right = next hour, tap left = previous, hold = pause (e.g. to read a caption),
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

  return (
    <div data-no-edge-swipe className="fixed inset-0 flex select-none flex-col overflow-hidden bg-black text-white">
      {/* Header sits above the clips, so nothing covers anyone's video. */}
      <header className="safe-top shrink-0 px-3 pb-2">
        <div className="flex gap-1">
          {slots.map((s, i) => (
            <div key={s.hour} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                key={i === index ? `run-${index}` : i}
                className={cx("h-full bg-white", i < index && "w-full", i > index && "w-0")}
                style={
                  i === index && !ended
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
        <div className="mt-2 flex items-center gap-2">
          <Link href={backHref} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1 text-center leading-tight">
            <p className="text-2xl font-bold tabular-nums">{formatHour(slot.hour)}</p>
            <p className="truncate text-xs text-white/60">
              {groupName} · {dateLabel}
            </p>
          </div>
          <button
            type="button"
            aria-label={muted ? "Sound on" : "Sound off"}
            onClick={() => setMuted((m) => !m)}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
            </svg>
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="relative min-h-0 flex-1"
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
        {/* Only if the wait is noticeable: a normal cut to the next hour takes a few ms. */}
        {!ended && !started ? (
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animation: "dv-fade-in 0.2s 0.35s both" }}>
            <Spinner className="text-white/70" />
          </span>
        ) : null}
        {paused ? (
          <span className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur">
            Paused · let go to continue
          </span>
        ) : null}
      </div>
      <div className="safe-bottom shrink-0" />
      <style>{`@keyframes dv-progress { from { width: 0 } to { width: 100% } } @keyframes dv-fade-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}
