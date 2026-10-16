import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { HttpError } from "./http";
import { groups, memberships, users } from "./schema";
import { isValidTimeZone, isValidWindow } from "./time";

export const MAX_MEMBERS = 12;

export const GroupSettings = z
  .object({
    name: z.string().trim().min(1, "Give the group a name").max(40, "Name is too long (max 40)"),
    timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
    firstHour: z.number().int().min(0).max(23),
    lastHour: z.number().int().min(0).max(23),
  })
  .refine((g) => isValidWindow(g.firstHour, g.lastHour), "The last drop has to come after the first one");

export async function listMyGroups(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      timezone: groups.timezone,
      firstHour: groups.firstHour,
      lastHour: groups.lastHour,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.joinedAt));
  return rows;
}

export async function requireMember(groupId: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ group: groups, notify: memberships.notify })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  if (!row) throw new HttpError(404, "Group not found");
  return row;
}

export async function requireOwner(groupId: string, userId: string) {
  const row = await requireMember(groupId, userId);
  if (row.group.ownerId !== userId) throw new HttpError(403, "Only the group owner can do that");
  return row;
}

export async function listMembers(groupId: string) {
  const db = await getDb();
  return db
    .select({ id: users.id, name: users.name, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.groupId, groupId))
    .orderBy(asc(memberships.joinedAt));
}

export async function memberCount(groupId: string) {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(memberships).where(eq(memberships.groupId, groupId));
  return row?.n ?? 0;
}
