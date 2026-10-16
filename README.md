# Day Vlog

A Setlog-style group video app as an installable web app (PWA). Every hour inside the group's drop window, everyone gets a notification and films a 2.5-second horizontal clip. Each hour becomes a split screen of everyone's clips stacked full width (uncropped), and the day plays back as one vlog. Days reset at 04:00.

- **Groups** of up to 12 people join with an invite code or link.
- **Hourly drops** run between a first and a last hour (default 06:00–22:00) in the **group's time zone**, which is set per group. Nobody gets notifications at night. Settings show the drop hours converted to your own clock when you're in another zone.
- **Clips** can only be recorded live for the current hour. A retake replaces your clip for that hour. The in-app camera always records a horizontal 2.5 s clip, so every clip has the same shape.
- **The vlog** is played back in the browser (no server-side rendering). Tiles keep the same order every hour, the hour shows in the middle, tap to skip and hold to pause.
- **Login** is email + password; iCloud Keychain saves the password and fills it in with Face ID. There's no email service, so a forgotten password is fixed by the group owner: Group → Members → *Reset password* creates a one-time 48-hour link.

## Stack

| Part | Local dev | Production |
|---|---|---|
| App | Next.js 16 (`npm run dev`) | Vercel, region `sin1` (Singapore, next to the database; set in `vercel.json`) |
| Database (metadata only) | PGlite in `.data/pglite`, automatic | Neon Postgres (`DATABASE_URL`) |
| Video files | `.data/storage` through `/api/dev-storage` | Cloudflare R2; phones upload directly with presigned URLs |
| Push | Web Push (VAPID keys in `.env.local`) | Same keys, set in Vercel |
| Hourly scheduler | Call `/api/cron/tick` by hand | cron-job.org or Upstash QStash at :00 and :10 of every hour |

Videos never go into the database and never pass through a Vercel function. A clip is a 1280×720 MP4 of about 1.5 MB, so a group of 6 posting every hour adds roughly 2–4 GB a month (with the 30-day cleanup that's the most ever stored). R2's free tier is 10 GB with free downloads. Clips older than `CLIP_RETENTION_DAYS` (default 30) are deleted by the scheduler.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first run creates the local database. `npm run dev` and `npm run build` both apply migrations first (`scripts/migrate.mts`).

- `/g/<id>/record?fake` uses a generated test video instead of the webcam (dev only).
- `curl http://localhost:3000/api/cron/tick` runs the scheduler once. Without `CRON_SECRET` it is open in dev.
- After changing `src/lib/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
- `node scripts/icons.mjs` regenerates the app icons.

## Deploying (about 20 minutes, free tiers)

1. **GitHub**: push this folder to a private repository.
2. **Vercel**: *Add New → Project*, import the repo, and keep the defaults. The first build fails until `DATABASE_URL` exists, which is expected.
3. **Neon**: in the Vercel project go to *Storage → Create Database → Neon*. This sets `DATABASE_URL` for you. Alternatively, create a project on neon.com and paste its **pooled** connection string as `DATABASE_URL`. Migrations run automatically on every deploy.
4. **Cloudflare R2**:
   1. Create a bucket, e.g. `dayvlog-clips`. Cloudflare may ask for a card to enable R2, but the free tier still applies.
   2. Create an **R2 API token** with *Object Read & Write* scoped to that bucket.
   3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` in Vercel.
   4. In the bucket's *Settings → CORS policy*, add the policy below, using your real domain:
      ```json
      [
        {
          "AllowedOrigins": ["https://YOUR-APP.vercel.app"],
          "AllowedMethods": ["GET", "PUT", "HEAD"],
          "AllowedHeaders": ["content-type"],
          "MaxAgeSeconds": 3600
        }
      ]
      ```
5. **Push keys**: run `npx web-push generate-vapid-keys` and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Vercel. Optionally set `VAPID_SUBJECT=mailto:you@example.com`; it defaults to the app's URL. Use new keys for production, not the ones in `.env.local`.
6. **Scheduler**:
   1. Set `CRON_SECRET` in Vercel to a long random string.
   2. On [cron-job.org](https://cron-job.org) (free), create a job with URL `https://YOUR-APP.vercel.app/api/cron/tick` that runs **every hour at minutes 0 and 10** (Custom schedule), with request header `Authorization: Bearer <CRON_SECRET>`. Don't run it more often: every call wakes the database, and Neon's free plan only covers about 400 awake hours a month (it sleeps after 5 idle minutes).
   3. Vercel's own free cron only runs once a day, so it can't do this. Upstash QStash schedules work the same way.
7. **Redeploy** in Vercel (Deployments → ⋯ → Redeploy). `NEXT_PUBLIC_*` values are baked in at build time, so changing them always needs a redeploy.

### On the iPhone (each person)

1. Open the invite link in **Safari**, then Share → **Add to Home Screen**.
2. Open **Day Vlog** from the Home Screen. Notifications only work there, and the installed app has its own login, separate from Safari.
3. Create an account, enter the invite code, and tap **Turn on drop notifications**. Settings has a **Send a test** button.

Requirements: iOS 16.4 or newer for web push.

## Environment variables

| Variable | Needed | What |
|---|---|---|
| `DATABASE_URL` | prod | Neon pooled connection string. Without it, dev uses PGlite. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | prod | Clip storage. Without them, dev stores files in `.data/storage`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | yes | Web Push keys |
| `VAPID_SUBJECT` | no | `mailto:` or `https:` contact for push services |
| `CRON_SECRET` | prod | Bearer token the scheduler sends to `/api/cron/tick` |
| `CLIP_RETENTION_DAYS` | no | Days to keep clips, default 30 |

## Not built yet

- Exporting a day as a single MP4 to save or share.
- A Japanese UI.
- Reactions or comments.
- The optional "only notify when home" idea: an iOS Shortcuts automation that pings the app when the phone joins home Wi-Fi.
