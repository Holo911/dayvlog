"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Loading } from "@/components/ui";
import { VlogPlayer, type Slot } from "@/components/VlogPlayer";
import { searchParam, useApi, useBrowser, type DayClip, type GroupInfo } from "@/lib/client";
import { dayLabel } from "@/lib/time";

export default function DayPage() {
  const { id, day } = useParams<{ id: string; day: string }>();
  const { data: info } = useApi<GroupInfo>(`/api/groups/${id}`);
  const { data } = useApi<{ clips: DayClip[] }>(`/api/groups/${id}/days/${day}`);
  const startHour = Number(useBrowser(searchParam("h"), null) ?? -1);

  // Clips arrive sorted in day order; tiles keep the same member order every hour.
  const slots = useMemo<Slot[]>(() => {
    if (!data || !info) return [];
    const order = new Map(info.members.map((m, i) => [m.id, i]));
    const out: Slot[] = [];
    for (const clip of data.clips) {
      let slot = out.find((s) => s.hour === clip.hour);
      if (!slot) out.push((slot = { hour: clip.hour, clips: [] }));
      slot.clips.push(clip);
    }
    for (const s of out) s.clips.sort((a, b) => (order.get(a.userId) ?? 99) - (order.get(b.userId) ?? 99));
    return out;
  }, [data, info]);

  if (!data || !info) return <Loading />;
  const startIndex = Math.max(0, slots.findIndex((s) => s.hour === startHour));

  return (
    <VlogPlayer
      slots={slots}
      startIndex={startIndex}
      title={`${info.group.name} · ${dayLabel(day)}`}
      backHref={`/g/${id}`}
    />
  );
}
