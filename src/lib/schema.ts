import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: createdAt(),
});

// The id is the SHA-256 of the cookie token, so a leaked table can't be replayed as cookies.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// One-time links a group owner hands to a member who forgot their password.
export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // IANA zone the drop hours are interpreted in, e.g. "Asia/Tokyo".
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  // Hourly drops fire at firstHour:00 … lastHour:00 local time (inclusive).
  firstHour: integer("first_hour").notNull().default(6),
  lastHour: integer("last_hour").notNull().default(22),
  inviteCode: text("invite_code").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Hourly drop reminders for this member.
    notify: boolean("notify").notNull().default(true),
    // A notification whenever someone else in the group posts a clip.
    notifyPosts: boolean("notify_posts").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

// One row per hourly notification actually sent, so a retried cron tick never double-sends.
export const drops = pgTable(
  "drops",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    hour: integer("hour").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.day, t.hour] })],
);

export const clips = pgTable(
  "clips",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Logical day (starts at 04:00 group time) and local clock hour of the slot.
    day: text("day").notNull(),
    hour: integer("hour").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationMs: integer("duration_ms"),
    caption: text("caption"),
    status: text("status", { enum: ["pending", "ready"] }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    index("clips_group_day_idx").on(t.groupId, t.day),
    uniqueIndex("clips_one_per_slot")
      .on(t.groupId, t.userId, t.day, t.hour)
      .where(sql`${t.status} = 'ready'`),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("push_user_idx").on(t.userId)],
);
