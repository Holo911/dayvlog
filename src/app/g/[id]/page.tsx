"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { GroupTabs } from "@/components/GroupTabs";
import { InstallHint } from "@/components/InstallHint";
import { PushToggle } from "@/components/PushToggle";
import { Card, ErrorText, LinkButton, Loading, Screen, TopBar, cx } from "@/components/ui";
import {
  deviceTimeZone,
  initials,
  LAST_GROUP,
  memberColor,
  useApi,
  useBrowser,
  useNow,
  type DayClip,
  type GroupInfo,
} from "@/lib/client";
import { cityName, clockIn, currentSlot, formatHour, inWindow, nextDropHour, slotOrder, windowHours } from "@/lib/time";

export default function TodayPage() {
  const { id } = useParams<{ id: string }>();
  const { data: info, error } = useApi<GroupInfo>(`/api/groups/${id}`);
  const now = useNow(15_000);
  const myZone = useBrowser(deviceTimeZone, null);
  const tz = info?.group.timezone;
  const slot = tz ? currentSlot(now, tz) : null;
  const { data: day } = useApi<{ day: string; clips: DayClip[] }>(slot ? `/api/groups/${id}/days/${slot.day}` : null, {
    refreshMs: 60_000,
  });

  useEffect(() => {
    localStorage.setItem(LAST_GROUP, id);
  }, [id]);

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
  if (!info || !slot || !tz) return <Loading />;

  const { group, members, me } = info;
  const open = inWindow(slot.hour, group.firstHour, group.lastHour);
  const posted = byHour.get(slot.hour) ?? [];
  const mine = posted.find((c) => c.userId === me.id);
  const next = nextDropHour(slot.hour, group.firstHour, group.lastHour);
  const hours = Array.from(new Set([...windowHours(group.firstHour, group.lastHour), ...byHour.keys()]))
    .filter((h) => slotOrder(h) <= slotOrder(slot.hour))
    .sort((a, b) => slotOrder(b) - slotOrder(a));
  const total = day?.clips.length ?? 0;

  return (
    <Screen className="gap-4">
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

      <Card className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-3xl font-bold tabular-nums">{formatHour(slot.hour)}</p>
            <p className="text-sm text-muted">
              {open
                ? `${60 - slot.minute} min left in this drop`
                : next !== null
                  ? `Quiet hours · next drop ${formatHour(next)}`
                  : `Done for today · first drop tomorrow ${formatHour(group.firstHour)}`}
            </p>
          </div>
          <p className="text-sm text-muted">
            {posted.length}/{members.length} in
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const done = posted.some((c) => c.userId === m.id);
            return (
              <span
                key={m.id}
                title={m.name}
                className={cx("grid size-8 place-items-center rounded-full text-[11px] font-bold text-black", !done && "opacity-25")}
                style={{ background: memberColor(m.id) }}
              >
                {initials(m.name)}
              </span>
            );
          })}
        </div>
        {mine ? (
          <div className="flex items-center gap-3">
            <video src={`${mine.url}#t=0.1`} muted playsInline preload="metadata" className="h-20 w-12 rounded-lg bg-black object-cover" />
            <div className="flex-1">
              <p className="font-semibold text-ok">You&apos;re in for {formatHour(slot.hour)} ✓</p>
              {mine.caption ? <p className="text-sm text-muted">“{mine.caption}”</p> : null}
            </div>
            <Link href={`/g/${id}/record`} className="text-sm text-muted underline underline-offset-4">
              Retake
            </Link>
          </div>
        ) : (
          <LinkButton href={`/g/${id}/record`} variant={open ? "primary" : "secondary"}>
            {open ? "Record your 2 seconds" : "Post anyway"}
          </LinkButton>
        )}
      </Card>

      <PushToggle compact />
      <InstallHint />

      {total ? (
        <LinkButton href={`/g/${id}/day/${slot.day}`} variant="secondary">
          ▶ Play today so far · {total} {total === 1 ? "clip" : "clips"}
        </LinkButton>
      ) : null}

      <section className="flex flex-col">
        {hours.map((h) => {
          const clips = byHour.get(h) ?? [];
          const row = (
            <div className="flex items-center gap-3 border-b border-line py-2.5">
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
              {clips.length ? <span className="text-muted">›</span> : null}
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

      <GroupTabs groupId={id} />
    </Screen>
  );
}
