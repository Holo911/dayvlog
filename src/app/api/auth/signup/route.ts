import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, startSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readBody, route } from "@/lib/http";
import { newId } from "@/lib/ids";
import { users } from "@/lib/schema";

const Body = z.object({
  email: z.email("Enter a valid email").transform((e) => e.trim().toLowerCase()),
  name: z.string().trim().min(1, "Enter your name").max(30, "Name is too long (max 30)"),
  password: z.string().min(8, "Password needs at least 8 characters").max(200),
});

export const POST = route(async (req) => {
  const { email, name, password } = await readBody(req, Body);
  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new HttpError(409, "An account with this email already exists. Sign in instead.");

  const id = newId();
  await db.insert(users).values({ id, email, name, passwordHash: await hashPassword(password) });
  await startSession(id);
  return json({ user: { id, name, email } });
});
