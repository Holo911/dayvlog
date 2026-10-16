import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { GroupSettings, listMembers, requireMember, requireOwner } from "@/lib/groups";
import { json, readBody, route } from "@/lib/http";
import { groups } from "@/lib/schema";

export const GET = route(async (_req, ctx: RouteContext<"/api/groups/[id]">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { group, notify } = await requireMember(id, user.id);
  return json({
    group: {
      id: group.id,
      name: group.name,
      timezone: group.timezone,
      firstHour: group.firstHour,
      lastHour: group.lastHour,
      inviteCode: group.inviteCode,
      ownerId: group.ownerId,
    },
    members: (await listMembers(id)).map((m) => ({ id: m.id, name: m.name })),
    me: { id: user.id, name: user.name, notify, isOwner: group.ownerId === user.id },
  });
});

export const PATCH = route(async (req, ctx: RouteContext<"/api/groups/[id]">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  await requireOwner(id, user.id);
  const settings = await readBody(req, GroupSettings);
  const db = await getDb();
  await db.update(groups).set(settings).where(eq(groups.id, id));
  return json({ ok: true });
});
