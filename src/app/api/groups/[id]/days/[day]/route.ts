import { requireUser } from "@/lib/auth";
import { dayClips } from "@/lib/clips";
import { requireMember } from "@/lib/groups";
import { HttpError, json, route } from "@/lib/http";

export const GET = route(async (_req, ctx: RouteContext<"/api/groups/[id]/days/[day]">) => {
  const { id, day } = await ctx.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "Bad date");
  const user = await requireUser();
  await requireMember(id, user.id);
  return json({ day, clips: await dayClips(id, day) });
});
