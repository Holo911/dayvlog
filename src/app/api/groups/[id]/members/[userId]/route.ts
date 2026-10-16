import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { removeClipsWhere } from "@/lib/clips";
import { getDb } from "@/lib/db";
import { requireMember, requireOwner } from "@/lib/groups";
import { assertSameOrigin, HttpError, json, route } from "@/lib/http";
import { clips, memberships } from "@/lib/schema";

// Owner removes someone from the group, along with their clips.
export const DELETE = route(async (req, ctx: RouteContext<"/api/groups/[id]/members/[userId]">) => {
  assertSameOrigin(req);
  const { id, userId } = await ctx.params;
  const user = await requireUser();
  await requireOwner(id, user.id);
  if (userId === user.id) throw new HttpError(400, "Use “Leave group” to remove yourself");
  await requireMember(id, userId);

  await removeClipsWhere(and(eq(clips.groupId, id), eq(clips.userId, userId)));
  const db = await getDb();
  await db.delete(memberships).where(and(eq(memberships.groupId, id), eq(memberships.userId, userId)));
  return json({ ok: true });
});
