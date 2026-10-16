// Applies the SQL files in api/drizzle/ that have not run yet. Called at
// server boot (src/index.ts), by the seed/reset scripts, and by the test
// setup — so a fresh clone or a fresh Neon database is always schema-complete.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { type Db, db, dbKind } from "./index";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

export async function runMigrations(target: Db = db) {
  // The two migrators are the same function typed for their own driver;
  // `dbKind` tells us which one matches the live connection.
  if (dbKind === "postgres") {
    await migrateNodePg(target as Parameters<typeof migrateNodePg>[0], { migrationsFolder });
  } else {
    await migratePglite(target as Parameters<typeof migratePglite>[0], { migrationsFolder });
  }
}
