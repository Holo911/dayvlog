import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, startSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readBody, route } from "@/lib/http";
import { sha256 } from "@/lib/ids";
import { passwordResets, sessions, users } from "@/lib/schema";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password needs at least 8 characters").max(200),
});

// Redeems a reset link created by a group owner (see /api/groups/[id]/members/[userId]/reset).
export const POST = route(async (req) => {
  const { token, password } = await readBody(req, Body);
  const db = await getDb();
  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.id, sha256(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    );
  if (!reset) throw new HttpError(400, "This reset link has expired or was already used. Ask for a new one.");

  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, reset.userId));
  // Sign out every other device, then sign in here.
  await db.delete(sessions).where(eq(sessions.userId, reset.userId));
  await startSession(reset.userId);
  return json({ ok: true });
});
