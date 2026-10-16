import { requireUser } from "@/lib/auth";
import { dayClips } from "@/lib/clips";
import { groupInfo } from "@/lib/groups";
import { json, route } from "@/lib/http";
import { currentSlot } from "@/lib/time";

// Everything the Today screen needs in one round trip: the group plus today's clips.
// (Separately, today's date depends on the group's time zone, so it took two requests.)
export const GET = route(async (_req, ctx: RouteContext<"/api/groups/[id]/today">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const info = await groupInfo(id, user);
  const { day } = currentSlot(new Date(), info.group.timezone);
  return json({ ...info, day, clips: await dayClips(id, day) });
});
