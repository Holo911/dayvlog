import { endSession } from "@/lib/auth";
import { assertSameOrigin, json, route } from "@/lib/http";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await endSession();
  return json({ ok: true });
});
