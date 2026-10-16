import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { GroupSettings, groupInfo, requireOwner } from "@/lib/groups";
import { json, readBody, route } from "@/lib/http";
import { groups } from "@/lib/schema";

export const GET = route(async (_req, ctx: RouteContext<"/api/groups/[id]">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  return json(await groupInfo(id, user));
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
