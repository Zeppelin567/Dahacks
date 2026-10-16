// `npm run db:reset` — wipe everything, re-apply migrations, re-seed.
// PGlite: deletes api/.data/pglite. Postgres: drops and recreates `public`.
import { rmSync } from "node:fs";
import { sql } from "drizzle-orm";
import { closeDb, db, dbKind, pgliteDataDir } from "./index";

if (dbKind === "postgres") {
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  const { seed } = await import("./seed");
  console.log("reset (postgres):", await seed());
  await closeDb();
} else {
  await closeDb();
  rmSync(pgliteDataDir, { recursive: true, force: true });
  console.log("reset (pglite): deleted", pgliteDataDir);
  console.log("run `npm run db:seed` to recreate it with demo data");
}
