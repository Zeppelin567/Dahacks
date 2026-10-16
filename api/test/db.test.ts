import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, dbKind, schema } from "../src/db";
import { DEMO_USER, SEED_ITEMS, seed } from "../src/db/seed";

describe("database", () => {
  it("tests run on in-memory PGlite", () => {
    expect(dbKind).toBe("pglite");
  });

  it("seed creates the demo user and items, and is idempotent", async () => {
    await seed();
    await seed();

    const [demo] = await db.select().from(schema.user).where(eq(schema.user.email, DEMO_USER.email));
    expect(demo).toBeDefined();

    const rows = await db.select().from(schema.items);
    const seeded = rows.filter((r) => SEED_ITEMS.some((s) => s.id === r.id));
    expect(seeded).toHaveLength(SEED_ITEMS.length);
    for (const r of seeded) expect(r.ownerId).toBe(demo?.id);
  });

  it("items get defaults and support update/delete", async () => {
    await seed();
    const [demo] = await db.select().from(schema.user).where(eq(schema.user.email, DEMO_USER.email));
    if (!demo) throw new Error("demo user missing");

    const [row] = await db.insert(schema.items).values({ title: "temp", ownerId: demo.id }).returning();
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.status).toBe("todo");
    expect(row?.createdAt).toBeInstanceOf(Date);
    if (!row) throw new Error("insert failed");

    const [updated] = await db
      .update(schema.items)
      .set({ status: "done" })
      .where(eq(schema.items.id, row.id))
      .returning();
    expect(updated?.status).toBe("done");

    await db.delete(schema.items).where(eq(schema.items.id, row.id));
    expect(await db.select().from(schema.items).where(eq(schema.items.id, row.id))).toHaveLength(0);
  });

  it("deleting a user cascades to their items", async () => {
    await seed();
    const [demo] = await db.select().from(schema.user).where(eq(schema.user.email, DEMO_USER.email));
    if (!demo) throw new Error("demo user missing");
    await db.delete(schema.user).where(eq(schema.user.id, demo.id));
    expect(await db.select().from(schema.items).where(eq(schema.items.ownerId, demo.id))).toHaveLength(0);
  });
});
