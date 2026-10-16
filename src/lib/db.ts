import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

// With DATABASE_URL (Neon) we use the serverless HTTP driver; without it, a local
// PGlite database in .data/pglite so the app runs with zero accounts during development.
const globalForDb = globalThis as unknown as { dayVlogDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.dayVlogDb ??= connect();
  return globalForDb.dayVlogDb;
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle({ client: neon(url), schema }) as unknown as DB;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  return drizzle({ client: new PGlite(".data/pglite"), schema }) as unknown as DB;
}
