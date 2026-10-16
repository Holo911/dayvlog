import { eq } from "drizzle-orm";
import { z } from "zod";
import { startSession, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readBody, route } from "@/lib/http";
import { users } from "@/lib/schema";

const Body = z.object({
  email: z.string().transform((e) => e.trim().toLowerCase()),
  password: z.string().max(200),
});

const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60_000;

export const POST = route(async (req) => {
  const { email, password } = await readBody(req, Body);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const wrong = new HttpError(401, "Wrong email or password");
  if (!user) throw wrong;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failures = user.failedLogins + 1;
    await db
      .update(users)
      .set(
        failures >= MAX_FAILURES
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
          : { failedLogins: failures },
      )
      .where(eq(users.id, user.id));
    throw wrong;
  }

  if (user.failedLogins || user.lockedUntil) {
    await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  }
  await startSession(user.id);
  return json({ user: { id: user.id, name: user.name, email: user.email } });
});
