import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { cleanupClips } from "./clips";
import { getDb } from "./db";
import { sendToUsers } from "./push";
import { drops, groups, memberships, sessions } from "./schema";
import { currentSlot, formatHour, inWindow, slotOrder } from "./time";

// A tick can arrive any time in the hour (external crons drift), but a drop announced at
// :45 would leave people 15 minutes, so drops only go out in the first half of the hour.
const SEND_BEFORE_MINUTE = 30;
const RETENTION_DAYS = Number(process.env.CLIP_RETENTION_DAYS ?? 30);

const PROMPTS = [
  "What are you up to? Film 2 seconds.",
  "Quick: show everyone where you are.",
  "Drop time. 2 seconds of your right now.",
  "What does your hour look like?",
  "New drop! Point the camera at your life.",
];

function message(groupName: string, hour: number, firstHour: number, lastHour: number) {
  const time = formatHour(hour);
  if (hour === firstHour) return { title: `${groupName} · ${time}`, body: "Good morning! First drop of the day." };
  if (hour === lastHour) return { title: `${groupName} · ${time}`, body: "Last drop of the day. Make it count." };
  return { title: `${groupName} · ${time}`, body: PROMPTS[slotOrder(hour) % PROMPTS.length] };
}

/** Called every few minutes by the scheduler; idempotent thanks to the drops table. */
export async function runTick(now = new Date()) {
  const db = await getDb();
  const all = await db.select().from(groups);
  const fired: { group: string; day: string; hour: number; sent: number }[] = [];

  for (const g of all) {
    const slot = currentSlot(now, g.timezone);
    if (slot.minute >= SEND_BEFORE_MINUTE || !inWindow(slot.hour, g.firstHour, g.lastHour)) continue;

    const inserted = await db
      .insert(drops)
      .values({ groupId: g.id, day: slot.day, hour: slot.hour })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) continue;

    const members = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.groupId, g.id), eq(memberships.notify, true)));
    const result = await sendToUsers(
      members.map((m) => m.userId),
      { ...message(g.name, slot.hour, g.firstHour, g.lastHour), url: `/g/${g.id}/record`, tag: `drop-${g.id}` },
      `drop-${g.id}`.slice(0, 32),
    );
    fired.push({ group: g.id, day: slot.day, hour: slot.hour, sent: result.sent });
  }

  const removedClips = await cleanupClips(RETENTION_DAYS);
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(drops).where(lt(drops.sentAt, new Date(now.getTime() - 14 * 86_400_000)));
  return { fired, removedClips };
}
