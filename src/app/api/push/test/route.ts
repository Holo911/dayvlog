import { requireUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, json, route } from "@/lib/http";
import { pushConfigured, sendToUsers } from "@/lib/push";

// "Send me a test notification" button in Settings.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!pushConfigured) throw new HttpError(503, "Push isn't set up on the server (VAPID keys missing)");
  const result = await sendToUsers([user.id], {
    title: "Day Vlog",
    body: "Notifications work. See you at the next drop!",
    url: "/",
  });
  if (!result.sent) throw new HttpError(404, "No device is subscribed yet. Turn notifications on first.");
  return json(result);
});
