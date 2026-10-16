import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireMember } from "@/lib/groups";
import { json, readBody, route } from "@/lib/http";
import { memberships } from "@/lib/schema";

const Body = z.object({ notify: z.boolean() });

// Per-member settings in a group: currently just muting the hourly drops.
export const PATCH = route(async (req, ctx: RouteContext<"/api/groups/[id]/me">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const { notify } = await readBody(req, Body);
  const db = await getDb();
  await db
    .update(memberships)
    .set({ notify })
    .where(and(eq(memberships.groupId, id), eq(memberships.userId, user.id)));
  return json({ ok: true });
});
