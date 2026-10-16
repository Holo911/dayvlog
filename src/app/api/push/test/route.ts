import { requireUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, json, route } from "@/lib/http";
import { pushConfigured, sendToUsers } from "@/lib/push";

// "Send me a test notification" button in Settings.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!pushConfigured) throw new HttpError(503, "Push isn't set up on the server (VAPID keys missing)");
  // Same shape as a real drop (own tag, same delivery options), so this tests the real path.
  const result = await sendToUsers([user.id], {
    title: "Day Vlog",
    body: "Notifications work. See you at the next drop!",
    url: "/",
    tag: `test-${Date.now()}`,
  });
  if (result.failed) throw new HttpError(502, `The push service refused it: ${result.errors[0] ?? "unknown error"}`);
  if (!result.sent) throw new HttpError(404, "No device is subscribed yet. Turn notifications on first.");
  return json(result);
});
