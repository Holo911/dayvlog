import { runTick } from "@/lib/drops";
import { json, route } from "@/lib/http";

// Hit this at :00 and :10 of every hour from an external scheduler (cron-job.org, Upstash
// QStash, …) with "Authorization: Bearer <CRON_SECRET>"; the :10 call is a retry in case the
// first one failed. Not more often: every call wakes the database, and Neon's free plan only
// covers about 400 awake hours a month. Vercel's free cron only runs once a day.
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const devOpen = !secret && process.env.NODE_ENV !== "production";
  if (!devOpen && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return json(await runTick());
}

export const GET = route(handle);
export const POST = route(handle);
