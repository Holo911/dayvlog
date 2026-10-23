import { and, eq, ne } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MAX_CLIP_BYTES, removeClips } from "@/lib/clips";
import { getDb } from "@/lib/db";
import { HttpError, json, readBody, route } from "@/lib/http";
import { notifyPost } from "@/lib/postNotify";
import { clips } from "@/lib/schema";
import { storage } from "@/lib/storage";

const Body = z.object({
  durationMs: z.number().int().min(0).max(600_000).optional(),
  caption: z.string().trim().max(60, "Caption is too long (max 60)").optional(),
});

const UPLOAD_GRACE_MS = 20 * 60_000;

// Step 2 of posting: check the upload really landed, then publish it. A retake within
// the same hour replaces the earlier clip. A new post (not a retake) notifies the group.
export const POST = route(async (req, ctx: RouteContext<"/api/clips/[id]/complete">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { durationMs, caption } = await readBody(req, Body);
  const db = await getDb();
  const [clip] = await db.select().from(clips).where(and(eq(clips.id, id), eq(clips.userId, user.id)));
  if (!clip) throw new HttpError(404, "Clip not found");
  if (clip.status === "ready") return json({ ok: true });
  if (Date.now() - clip.createdAt.getTime() > UPLOAD_GRACE_MS) {
    await removeClips([clip]);
    throw new HttpError(410, "This upload took too long. Record a new clip.");
  }

  const object = await storage.head(clip.storageKey);
  if (!object) throw new HttpError(400, "The upload didn't arrive. Try again.");
  if (object.size > MAX_CLIP_BYTES) {
    await removeClips([clip]);
    throw new HttpError(413, "That video is too big. Keep clips to a few seconds.");
  }

  const previous = await db
    .select({ id: clips.id, storageKey: clips.storageKey })
    .from(clips)
    .where(
      and(
        eq(clips.groupId, clip.groupId),
        eq(clips.userId, user.id),
        eq(clips.day, clip.day),
        eq(clips.hour, clip.hour),
        eq(clips.status, "ready"),
        ne(clips.id, clip.id),
      ),
    );
  await removeClips(previous);

  await db
    .update(clips)
    .set({ status: "ready", sizeBytes: object.size, durationMs: durationMs ?? null, caption: caption || null })
    .where(eq(clips.id, clip.id));

  // Tell the others once the response is on its way, so posting doesn't wait for push delivery.
  if (!previous.length) {
    after(() =>
      notifyPost({ ...clip, caption: caption || null }).catch((err) => console.error("post notification failed", err)),
    );
  }
  return json({ ok: true, day: clip.day, hour: clip.hour });
});
