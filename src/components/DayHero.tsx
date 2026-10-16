"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useClipUrls } from "@/lib/clipCache";
import { memberColor, type DayClip } from "@/lib/client";
import { formatHour } from "@/lib/time";
import { GAP, layout, useBoxSize } from "./VlogPlayer";

const PAD = 8;

/**
 * The centrepiece of the group screen: the latest hour's clips playing live in their split
 * screen, with a big play button for the whole day. It also downloads the day's first hour
 * in the background, so pressing play starts instantly.
 */
export function DayHero({
  href,
  label,
  clips,
  memberOrder,
  emptyTitle,
  emptyText,
}: {
  href: string;
  label: string;
  clips: DayClip[];
  memberOrder: string[];
  emptyTitle: string;
  emptyText: string;
}) {
  const [boxRef, box] = useBoxSize();

  // Clips arrive in day order, so the last one belongs to the latest hour.
  const latestHour = clips.length ? clips[clips.length - 1].hour : null;
  const firstHour = clips.length ? clips[0].hour : null;
  const latest = useMemo(() => {
    const rank = (id: string) => (memberOrder.indexOf(id) + 1 || 99);
    return clips.filter((c) => c.hour === latestHour).sort((a, b) => rank(a.userId) - rank(b.userId));
  }, [clips, latestHour, memberOrder]);
  const opening = useMemo(() => clips.filter((c) => c.hour === firstHour), [clips, firstHour]);

  const urls = useClipUrls(latest);
  useClipUrls(opening);
  const ready = latest.length > 0 && latest.every((c) => urls[c.id]);

  const people = new Set(clips.map((c) => c.userId)).size;
  const hours = new Set(clips.map((c) => c.hour)).size;
  const { cols, tileW, tileH } = layout(latest.length, box.w, box.h);

  if (!clips.length) {
    return (
      <div className="mx-auto flex aspect-[4/5] max-h-[58dvh] w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mb-2 text-muted">
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
        <p className="text-lg font-semibold">{emptyTitle}</p>
        <p className="text-sm text-muted">{emptyText}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`Watch ${label.toLowerCase()}'s vlog`}
      className="relative mx-auto block aspect-[4/5] max-h-[58dvh] w-full overflow-hidden rounded-3xl bg-black active:opacity-90"
    >
      <div ref={boxRef} className="absolute flex items-center justify-center" style={{ inset: PAD }}>
        {ready && tileW > 0 ? (
          <div className="flex flex-wrap content-center justify-center" style={{ width: cols * tileW + (cols - 1) * GAP, gap: GAP }}>
            {latest.map((c) => (
              <div key={c.id} className="relative shrink-0 overflow-hidden rounded-xl bg-neutral-950" style={{ width: tileW, height: tileH }}>
                <video src={urls[c.id]} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
                <p className="absolute bottom-1.5 left-2 truncate text-[11px] font-semibold drop-shadow" style={{ color: memberColor(c.userId) }}>
                  {c.userName}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums backdrop-blur">
        Latest · {latestHour !== null ? formatHour(latestHour) : ""}
      </span>

      <span className="absolute left-1/2 top-1/2 grid size-18 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/25 backdrop-blur-md">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="white" aria-hidden>
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
        </svg>
      </span>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-12">
        <p className="text-2xl font-bold">{label}</p>
        <p className="text-sm text-white/75">
          {clips.length} {clips.length === 1 ? "clip" : "clips"} · {people} {people === 1 ? "person" : "people"} · {hours}{" "}
          {hours === 1 ? "hour" : "hours"}
        </p>
      </div>
    </Link>
  );
}
