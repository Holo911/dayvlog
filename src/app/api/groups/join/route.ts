import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MAX_MEMBERS, memberCount } from "@/lib/groups";
import { HttpError, json, readBody, route } from "@/lib/http";
import { groups, memberships } from "@/lib/schema";

const Body = z.object({ code: z.string().trim().toUpperCase().min(4).max(12) });

export const POST = route(async (req) => {
  const user = await requireUser();
  const { code } = await readBody(req, Body);
  const db = await getDb();
  const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.inviteCode, code));
  if (!group) throw new HttpError(404, "No group with that code. Check it with whoever invited you.");

  const [already] = await db
    .select({ g: memberships.groupId })
    .from(memberships)
    .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, user.id)));
  if (already) return json({ id: group.id });

  if ((await memberCount(group.id)) >= MAX_MEMBERS) {
    throw new HttpError(409, `This group is full (${MAX_MEMBERS} people max).`);
  }
  await db.insert(memberships).values({ groupId: group.id, userId: user.id });
  return json({ id: group.id });
});
