// Single source of truth for the database. Edit here, then:
//   npm run db:generate   -> writes a SQL migration to api/drizzle/
//   (restart the server)  -> migrations apply automatically on boot
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// user / session / account / verification tables, generated from auth.ts by
// `npx auth@latest generate --config src/auth.ts --output src/db/auth-schema.ts`.
// Re-run that command whenever you add a Better Auth plugin.
export * from "./auth-schema";

export const itemStatus = pgEnum("item_status", ["todo", "doing", "done"]);

/**
 * `items` is the CRUD example. It is deliberately generic — a titled thing
 * with notes and a status, owned by a user — so it can be renamed to whatever
 * the hackathon needs (tasks, posts, sensors, recipes…).
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    status: itemStatus("status").notNull().default("todo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("items_owner_idx").on(t.ownerId)],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
