import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "./db";
import { sendToUsers } from "./push";
import { groups, memberships, users } from "./schema";
import { currentSlot, formatHour, inWindow } from "./time";

/**
 * "Ken posted at 14:00": tells the rest of the group about a new clip (not about retakes).
 * Goes to members who kept "when friends post" on, and only inside the group's drop hours,
 * like the hourly reminders, so nobody gets pinged at night.
 */
export async function notifyPost(clip: { id: string; groupId: string; userId: string; day: string; hour: number; caption: string | null }) {
  const db = await getDb();
  const [group] = await db.select().from(groups).where(eq(groups.id, clip.groupId));
  if (!group) return;
  const now = currentSlot(new Date(), group.timezone);
  if (!inWindow(now.hour, group.firstHour, group.lastHour)) return;

  const [poster] = await db.select({ name: users.name }).from(users).where(eq(users.id, clip.userId));
  const recipients = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.groupId, clip.groupId), eq(memberships.notifyPosts, true), ne(memberships.userId, clip.userId)));
  if (!recipients.length) return;

  const name = poster?.name ?? "Someone";
  await sendToUsers(
    recipients.map((r) => r.userId),
    {
      title: `${group.name} · ${formatHour(clip.hour)}`,
      body: clip.caption ? `${name}: “${clip.caption}”` : `${name} just posted`,
      // Opens the vlog right at that hour.
      url: `/g/${clip.groupId}/day/${clip.day}?h=${clip.hour}`,
      // One tag per clip, so every post shows as its own notification (a shared tag would
      // silently replace the previous one on iPhone).
      tag: `post-${clip.id}`,
    },
  );
}
