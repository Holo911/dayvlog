import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { removeClips } from "@/lib/clips";
import { getDb } from "@/lib/db";
import { assertSameOrigin, HttpError, json, route } from "@/lib/http";
import { clips } from "@/lib/schema";

// Delete one of your own clips.
export const DELETE = route(async (req, ctx: RouteContext<"/api/clips/[id]">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await requireUser();
  const db = await getDb();
  const [clip] = await db
    .select({ id: clips.id, storageKey: clips.storageKey })
    .from(clips)
    .where(and(eq(clips.id, id), eq(clips.userId, user.id)));
  if (!clip) throw new HttpError(404, "Clip not found");
  await removeClips([clip]);
  return json({ ok: true });
});
