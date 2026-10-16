import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, readBody, route } from "@/lib/http";
import { newId } from "@/lib/ids";
import { pushSubscriptions } from "@/lib/schema";

const Body = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

// Registers (or re-assigns) this device's push subscription to the signed-in user.
export const POST = route(async (req) => {
  const user = await requireUser();
  const { endpoint, keys } = await readBody(req, Body);
  const db = await getDb();
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await db
    .insert(pushSubscriptions)
    .values({ id: newId(), userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
  return json({ ok: true });
});

const Unsubscribe = z.object({ endpoint: z.url().max(1000) });

export const DELETE = route(async (req) => {
  await requireUser();
  const { endpoint } = await readBody(req, Unsubscribe);
  const db = await getDb();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return json({ ok: true });
});
