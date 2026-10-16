import "server-only";
import { inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "./db";
import { pushSubscriptions } from "./schema";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
export const pushConfigured = Boolean(publicKey && privateKey);

if (pushConfigured) {
  // Apple's push service requires a real https: or mailto: subject in the VAPID JWT.
  const subject =
    process.env.VAPID_SUBJECT ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://dayvlog.localhost.test");
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushResult = { sent: number; failed: number; pruned: number; errors: string[] };

/**
 * Sends to every registered device of the given users; prunes subscriptions the browser dropped.
 * Drops and the Settings test go through here with identical options, so a passing test means
 * drops get delivered too.
 */
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
  if (!pushConfigured || !userIds.length) return { sent: 0, failed: 0, pruned: 0, errors: [] };
  const db = await getDb();
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));

  const gone: string[] = [];
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          // A drop is stale after its hour. (No Topic header: not every push service accepts it.)
          { TTL: 3600, urgency: "high" },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else {
          failed++;
          const host = new URL(s.endpoint).host;
          errors.push(`${host}: ${status ?? ""} ${(err as { body?: string }).body ?? (err as Error).message}`.slice(0, 200));
          console.error("push failed", host, status, (err as Error).message);
        }
      }
    }),
  );
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return { sent, failed, pruned: gone.length, errors };
}
