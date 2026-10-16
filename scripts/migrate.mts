// Applies ./drizzle migrations. Runs before `next dev` and `next build`, so Vercel
// deployments migrate Neon automatically and local dev migrates the PGlite database.
import { mkdirSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: fine on Vercel, where env vars come from the project settings.
}

const url = process.env.DATABASE_URL;

if (url) {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle({ client: neon(url) }), { migrationsFolder: "drizzle" });
  console.log("migrate: Neon database is up to date");
} else if (process.env.VERCEL) {
  throw new Error("migrate: DATABASE_URL is not set in this Vercel project");
} else {
  mkdirSync(".data", { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(".data/pglite");
  await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
  await client.close();
  console.log("migrate: local PGlite database (.data/pglite) is up to date");
}
