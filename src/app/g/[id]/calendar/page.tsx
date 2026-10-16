"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { GroupFrame } from "@/components/GroupTabs";
import { Card, Loading, TopBar } from "@/components/ui";
import { useApi, type GroupInfo } from "@/lib/client";
import { addDays, currentSlot, dayLabel } from "@/lib/time";

type Day = { day: string; clips: number; people: number; hours: number };

export default function CalendarPage() {
  const { id } = useParams<{ id: string }>();
  const { data: info } = useApi<GroupInfo>(`/api/groups/${id}`);
  const { data } = useApi<{ days: Day[] }>(`/api/groups/${id}/days`);

  if (!info || !data) {
    return (
      <GroupFrame groupId={id}>
        <Loading />
      </GroupFrame>
    );
  }
  const today = currentSlot(new Date(), info.group.timezone).day;
  const yesterday = addDays(today, -1);
  const name = (d: string) => (d === today ? "Today" : d === yesterday ? "Yesterday" : dayLabel(d, { weekday: "long" }));

  return (
    <GroupFrame groupId={id}>
      <TopBar title="Days" back={`/g/${id}`} />
      {data.days.length === 0 ? (
        <p className="py-8 text-center text-muted">No clips yet. After the first drop, every day shows up here as a vlog.</p>
      ) : null}
      {data.days.map((d) => (
        <Link key={d.day} href={`/g/${id}/day/${d.day}`}>
          <Card className="flex items-center gap-4 active:bg-raised">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-raised text-center leading-none">
              <span className="text-lg font-bold">{Number(d.day.slice(8))}</span>
              <span className="text-[10px] uppercase text-muted">{dayLabel(d.day, { month: "short" })}</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold">{name(d.day)}</p>
              <p className="text-sm text-muted">
                {d.clips} clips · {d.people} {d.people === 1 ? "person" : "people"} · {d.hours} {d.hours === 1 ? "hour" : "hours"}
              </p>
            </div>
            <span className="text-xl">▶</span>
          </Card>
        </Link>
      ))}
    </GroupFrame>
  );
}
