import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ALLOWED_TYPES, MAX_CLIP_BYTES } from "@/lib/clips";
import { getDb } from "@/lib/db";
import { requireMember } from "@/lib/groups";
import { HttpError, json, readBody, route } from "@/lib/http";
import { newId } from "@/lib/ids";
import { clips } from "@/lib/schema";
import { storage } from "@/lib/storage";
import { currentSlot } from "@/lib/time";

const Body = z.object({
  groupId: z.string().min(1),
  contentType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
});

// Step 1 of posting: the server fixes the slot (the group's current hour, so nobody can
// backfill) and hands out a short-lived upload URL. The phone then PUTs the video there
// and calls /api/clips/[id]/complete.
export const POST = route(async (req) => {
  const user = await requireUser();
  const { groupId, contentType: rawType, sizeBytes } = await readBody(req, Body);
  const { group } = await requireMember(groupId, user.id);

  const contentType = rawType.split(";")[0].trim().toLowerCase();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new HttpError(415, `Unsupported video format (${contentType})`);
  if (sizeBytes > MAX_CLIP_BYTES) throw new HttpError(413, "That video is too big. Keep clips to a few seconds.");

  const { day, hour } = currentSlot(new Date(), group.timezone);
  const id = newId();
  const storageKey = `clips/${group.id}/${day}/${hour}-${user.id}-${id}.${ext}`;
  const db = await getDb();
  await db.insert(clips).values({
    id,
    groupId,
    userId: user.id,
    day,
    hour,
    storageKey,
    contentType,
    sizeBytes,
  });
  return json({ clipId: id, day, hour, upload: await storage.uploadTarget(storageKey, contentType) });
});
