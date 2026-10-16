import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireOwner } from "@/lib/groups";
import { assertSameOrigin, json, route } from "@/lib/http";
import { newInviteCode } from "@/lib/ids";
import { groups } from "@/lib/schema";

// Issues a fresh invite code; the old one stops working (members already in stay in).
export const POST = route(async (req, ctx: RouteContext<"/api/groups/[id]/invite">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await requireUser();
  await requireOwner(id, user.id);
  const inviteCode = newInviteCode();
  const db = await getDb();
  await db.update(groups).set({ inviteCode }).where(eq(groups.id, id));
  return json({ inviteCode });
});
