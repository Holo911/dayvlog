import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireMember } from "@/lib/groups";
import { json, readBody, route } from "@/lib/http";
import { memberships } from "@/lib/schema";

const Body = z
  .object({
    // Hourly drop reminders.
    notify: z.boolean().optional(),
    // "Someone posted" notifications.
    notifyPosts: z.boolean().optional(),
  })
  .refine((b) => b.notify !== undefined || b.notifyPosts !== undefined, "Nothing to change");

// Per-member notification settings in a group.
export const PATCH = route(async (req, ctx: RouteContext<"/api/groups/[id]/me">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const changes = await readBody(req, Body);
  const db = await getDb();
  await db
    .update(memberships)
    .set(changes)
    .where(and(eq(memberships.groupId, id), eq(memberships.userId, user.id)));
  return json({ ok: true });
});
