import { and, countDistinct, count, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireMember } from "@/lib/groups";
import { json, route } from "@/lib/http";
import { clips } from "@/lib/schema";

// Calendar: every day that has clips, newest first.
export const GET = route(async (_req, ctx: RouteContext<"/api/groups/[id]/days">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const db = await getDb();
  const days = await db
    .select({ day: clips.day, clips: count(), people: countDistinct(clips.userId), hours: countDistinct(clips.hour) })
    .from(clips)
    .where(and(eq(clips.groupId, id), eq(clips.status, "ready")))
    .groupBy(clips.day)
    .orderBy(desc(clips.day))
    .limit(120);
  return json({ days });
});
