import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { removeClipsWhere } from "@/lib/clips";
import { getDb } from "@/lib/db";
import { listMembers, requireMember } from "@/lib/groups";
import { assertSameOrigin, json, route } from "@/lib/http";
import { clips, groups, memberships } from "@/lib/schema";

// Leaving deletes your clips in the group. The last person out deletes the group;
// an owner who leaves hands the group to the longest-standing member.
export const POST = route(async (req, ctx: RouteContext<"/api/groups/[id]/leave">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await requireUser();
  const { group } = await requireMember(id, user.id);
  const db = await getDb();

  const others = (await listMembers(id)).filter((m) => m.id !== user.id);
  if (!others.length) {
    await removeClipsWhere(eq(clips.groupId, id));
    await db.delete(groups).where(eq(groups.id, id));
    return json({ ok: true, deleted: true });
  }

  await removeClipsWhere(and(eq(clips.groupId, id), eq(clips.userId, user.id)));
  await db.delete(memberships).where(and(eq(memberships.groupId, id), eq(memberships.userId, user.id)));
  if (group.ownerId === user.id) {
    await db.update(groups).set({ ownerId: others[0].id }).where(eq(groups.id, id));
  }
  return json({ ok: true, deleted: false });
});
