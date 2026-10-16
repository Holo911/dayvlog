import { runTick } from "@/lib/drops";
import { json, route } from "@/lib/http";

// Hit this every 5 minutes from an external scheduler (cron-job.org, Upstash QStash, …)
// with "Authorization: Bearer <CRON_SECRET>". Vercel's free cron only runs once a day.
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
