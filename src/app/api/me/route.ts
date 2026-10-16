import { getCurrentUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { listMyGroups } from "@/lib/groups";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return json({ user: null, groups: [] });
  return json({ user, groups: await listMyGroups(user.id) });
});
