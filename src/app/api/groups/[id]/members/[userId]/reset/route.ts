import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireMember, requireOwner } from "@/lib/groups";
import { assertSameOrigin, json, route } from "@/lib/http";
import { newToken, sha256 } from "@/lib/ids";
import { passwordResets } from "@/lib/schema";

const RESET_HOURS = 48;

// There is no email service, so a forgotten password is fixed by the group owner:
// they create a one-time link here and send it to the member (LINE, iMessage, …).
export const POST = route(async (req, ctx: RouteContext<"/api/groups/[id]/members/[userId]/reset">) => {
  assertSameOrigin(req);
  const { id, userId } = await ctx.params;
  const user = await requireUser();
  await requireOwner(id, user.id);
  await requireMember(id, userId);

  const token = newToken();
  const db = await getDb();
  await db.insert(passwordResets).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000),
  });
  return json({ path: `/reset/${token}`, expiresInHours: RESET_HOURS });
});
