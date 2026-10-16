import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { GroupSettings, listMyGroups } from "@/lib/groups";
import { json, readBody, route } from "@/lib/http";
import { newId, newInviteCode } from "@/lib/ids";
import { groups, memberships } from "@/lib/schema";

export const GET = route(async () => {
  const user = await requireUser();
  return json({ groups: await listMyGroups(user.id) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const settings = await readBody(req, GroupSettings);
  const db = await getDb();
  const id = newId();
  await db.insert(groups).values({ id, ...settings, inviteCode: newInviteCode(), ownerId: user.id });
  await db.insert(memberships).values({ groupId: id, userId: user.id });
  return json({ id });
});
