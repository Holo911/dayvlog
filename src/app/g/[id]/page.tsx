"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { GroupFrame } from "@/components/GroupTabs";
import { InstallHint } from "@/components/InstallHint";
import { PushToggle } from "@/components/PushToggle";
import { DayHero } from "@/components/DayHero";
import { ErrorText, Loading, Screen, TopBar, cx } from "@/components/ui";
import {
  deviceTimeZone,
  initials,
  LAST_GROUP,
  memberColor,
  prefetchApi,
  primeCache,
  useApi,
  useBrowser,
  useNow,
  type DayClip,
  type GroupInfo,
} from "@/lib/client";
import { cityName, clockIn, currentSlot, formatHour, inWindow, nextDropHour, slotOrder, windowHours } from "@/lib/time";

type Today = GroupInfo & { day: string; clips: DayClip[] };

export default function TodayPage() {
  const { id } = useParams<{ id: string }>();
  // One request for the group and today's clips (the date depends on the group's time zone).
  const { data: info, error, reload } = useApi<Today>(`/api/groups/${id}/today`, { refreshMs: 60_000 });
  const day = info;
  const now = useNow(15_000);
  const myZone = useBrowser(deviceTimeZone, null);
  const tz = info?.group.timezone;
  const slot = tz ? currentSlot(now, tz) : null;
  const stale = Boolean(slot && info && slot.day !== info.day);

  useEffect(() => {
    localStorage.setItem(LAST_GROUP, id);
  }, [id]);

  // Hand the data to the other tabs and warm the Days list, so switching tabs is instant.
  useEffect(() => {
    if (!info) return;
    const { group, members, me, day: today, clips } = info;
    primeCache(`/api/groups/${id}`, { group, members, me });
    primeCache(`/api/groups/${id}/days/${today}`, { day: today, clips });
    prefetchApi(`/api/groups/${id}/days`);
  }, [id, info]);

  // The day rolled over at 04:00 while the app was open.
  useEffect(() => {
    if (stale) void reload();
  }, [stale, reload]);

  const byHour = useMemo(() => {
    const map = new Map<number, DayClip[]>();
    for (const c of day?.clips ?? []) map.set(c.hour, [...(map.get(c.hour) ?? []), c]);
    return map;
  }, [day]);

  if (error) {
    return (
      <Screen className="gap-4">
        <TopBar title="Day Vlog" back="/?home" />
        <ErrorText>{error}</ErrorText>
      </Screen>
    );
  }
  if (!info || !slot || !tz) {
    return (
      <GroupFrame groupId={id}>
        <Loading />
      </GroupFrame>
    );
  }

  const { group, members, me } = info;
  const open = inWindow(slot.hour, group.firstHour, group.lastHour);
  const posted = byHour.get(slot.hour) ?? [];
  const mine = posted.find((c) => c.userId === me.id);
  const next = nextDropHour(slot.hour, group.firstHour, group.lastHour);
  const hours = Array.from(new Set([...windowHours(group.firstHour, group.lastHour), ...byHour.keys()]))
    .filter((h) => slotOrder(h) <= slotOrder(slot.hour))
    .sort((a, b) => slotOrder(b) - slotOrder(a));
  const status = open
    ? `${60 - slot.minute} min left`
    : next !== null
      ? `Quiet hours · next drop ${formatHour(next)}`
      : `First drop tomorrow ${formatHour(group.firstHour)}`;

  // Pinned above the tabs so recording is always one tap away, wherever you scroll.
  const recordBar = mine ? (
    <div className="flex h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4">
      <span className="text-ok">✓</span>
      <p className="flex-1 text-sm">
        You&apos;re in for <b className="tabular-nums">{formatHour(slot.hour)}</b>
      </p>
      <Link href={`/g/${id}/record`} className="text-sm text-muted underline underline-offset-4">
        Retake
      </Link>
    </div>
  ) : (
    <Link
      href={`/g/${id}/record`}
      className={cx(
        "flex h-12 items-center justify-center gap-2.5 rounded-2xl px-4 font-semibold",
        open ? "bg-accent text-accent-ink" : "border border-line bg-surface text-ink",
      )}
    >
      <span className={cx("size-3 rounded-full", open ? "bg-accent-ink" : "bg-accent")} />
      {open ? `Record your ${formatHour(slot.hour)} clip` : "Post a clip anyway"}
    </Link>
  );

  return (
    <GroupFrame groupId={id} action={recordBar}>
      <TopBar
        back="/?home"
        title={group.name}
        right={
          <span className="text-right text-xs leading-tight text-muted">
            {cityName(tz)} {clockIn(now, tz)}
            {myZone && myZone !== tz ? (
              <>
                <br />
                you {clockIn(now, myZone)}
              </>
            ) : null}
          </span>
        }
      />

      <DayHero
        href={`/g/${id}/day/${slot.day}`}
        label="Today"
        clips={day?.clips ?? []}
        memberOrder={members.map((m) => m.id)}
        emptyTitle="No clips yet today"
        emptyText={open ? "Be the first: record your 2 seconds below." : `The first drop is at ${formatHour(group.firstHour)}.`}
      />

      <div className="flex items-center gap-3 px-1">
        <div className="flex-1">
          <p className="font-semibold tabular-nums">
            {formatHour(slot.hour)} {open ? "drop" : ""}
          </p>
          <p className="text-sm text-muted">{status}</p>
        </div>
        <div className="flex -space-x-1.5">
          {members.map((m) => {
            const done = posted.some((c) => c.userId === m.id);
            return (
              <span
                key={m.id}
                title={m.name}
                className={cx(
                  "grid size-8 place-items-center rounded-full border-2 border-bg text-[11px] font-bold text-black",
                  !done && "opacity-25",
                )}
                style={{ background: memberColor(m.id) }}
              >
                {initials(m.name)}
              </span>
            );
          })}
        </div>
        <span className="w-9 text-right text-sm text-muted tabular-nums">
          {posted.length}/{members.length}
        </span>
      </div>

      <PushToggle compact />
      <InstallHint />

      <section className="flex flex-col">
        <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Today by the hour</p>
        {hours.map((h) => {
          const clips = byHour.get(h) ?? [];
          const row = (
            <div className="flex items-center gap-3 border-b border-line px-1 py-2.5">
              <span className={cx("w-12 font-mono text-sm tabular-nums", clips.length ? "text-ink" : "text-muted")}>{formatHour(h)}</span>
              <div className="flex flex-1 -space-x-1.5">
                {clips.map((c) => (
                  <span
                    key={c.id}
                    title={c.userName}
                    className="grid size-7 place-items-center rounded-full border-2 border-bg text-[10px] font-bold text-black"
                    style={{ background: memberColor(c.userId) }}
                  >
                    {initials(c.userName)}
                  </span>
                ))}
                {!clips.length ? <span className="text-sm text-muted">{h === slot.hour ? "now" : "no clips"}</span> : null}
              </div>
              {clips.length ? <span className="text-muted">▶</span> : null}
            </div>
          );
          return clips.length ? (
            <Link key={h} href={`/g/${id}/day/${slot.day}?h=${h}`}>
              {row}
            </Link>
          ) : (
            <div key={h}>{row}</div>
          );
        })}
      </section>

    </GroupFrame>
  );
}
