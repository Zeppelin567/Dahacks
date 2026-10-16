// Demo account plus a few items so the UI is never empty. Idempotent: the
// user is looked up by email, items are upserted by fixed id, so run it as
// often as you like. CLI entry: seed-cli.ts (`npm run db:seed`).
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db, schema } from "./index";
import { runMigrations } from "./migrate";

export const DEMO_USER = {
  name: "Demo User",
  email: "demo@example.com",
  password: "demo1234!",
};

export const SEED_ITEMS: Omit<typeof schema.items.$inferInsert, "ownerId">[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Rename this module",
    notes: "Items is a placeholder. Search the repo for `items` and rename it to your domain object.",
    status: "todo",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Edit app.config.ts",
    notes: "Name, tagline, logo, brand color, which modules show up.",
    status: "doing",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    title: "Read /docs",
    notes: "Every route is documented and can be tried from the browser.",
    status: "done",
  },
];

async function ensureDemoUser() {
  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, DEMO_USER.email));
  if (existing) return existing;
  const res = await auth.api.signUpEmail({ body: DEMO_USER });
  return res.user;
}

export async function seed() {
  await runMigrations();
  const owner = await ensureDemoUser();
  await db
    .insert(schema.items)
    .values(SEED_ITEMS.map((i) => ({ ...i, ownerId: owner.id })))
    .onConflictDoUpdate({
      target: schema.items.id,
      set: { title: schema.items.title, notes: schema.items.notes, status: schema.items.status },
    });
  return { user: DEMO_USER.email, items: SEED_ITEMS.length };
}
