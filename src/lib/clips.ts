import "server-only";
import { and, asc, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { clips, users } from "./schema";
import { storage } from "./storage";
import { slotOrder } from "./time";

export const MAX_CLIP_BYTES = 25 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Deletes clip rows and their files. Storage first, so a failure leaves rows to retry. */
export async function removeClips(rows: { id: string; storageKey: string }[]) {
  if (!rows.length) return;
  await storage.remove(rows.map((r) => r.storageKey));
  const db = await getDb();
  await db.delete(clips).where(
    inArray(
      clips.id,
      rows.map((r) => r.id),
    ),
  );
}

export async function removeClipsWhere(where: SQL | undefined) {
  const db = await getDb();
  const rows = await db.select({ id: clips.id, storageKey: clips.storageKey }).from(clips).where(where);
  await removeClips(rows);
  return rows.length;
}

export type DayClip = {
  id: string;
  userId: string;
  userName: string;
  hour: number;
  url: string;
  contentType: string;
  durationMs: number | null;
  caption: string | null;
  createdAt: string;
};

/** Every ready clip of one logical day, with short-lived view URLs, grouped by hour in day order. */
export async function dayClips(groupId: string, day: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: clips.id,
      userId: clips.userId,
      userName: users.name,
      hour: clips.hour,
      storageKey: clips.storageKey,
      contentType: clips.contentType,
      durationMs: clips.durationMs,
      caption: clips.caption,
      createdAt: clips.createdAt,
    })
    .from(clips)
    .innerJoin(users, eq(users.id, clips.userId))
    .where(and(eq(clips.groupId, groupId), eq(clips.day, day), eq(clips.status, "ready")))
    .orderBy(asc(clips.createdAt));

  const withUrls: DayClip[] = await Promise.all(
    rows.map(async ({ storageKey, createdAt, ...r }) => ({
      ...r,
      url: await storage.viewUrl(storageKey),
      createdAt: createdAt.toISOString(),
    })),
  );
  return withUrls.sort((a, b) => slotOrder(a.hour) - slotOrder(b.hour));
}

/** Pending uploads nobody finished, plus everything older than the retention window. */
export async function cleanupClips(retentionDays: number) {
  const now = Date.now();
  return removeClipsWhere(
    or(
      and(eq(clips.status, "pending"), lt(clips.createdAt, new Date(now - 3_600_000))),
      lt(clips.createdAt, new Date(now - retentionDays * 86_400_000)),
    ),
  );
}
