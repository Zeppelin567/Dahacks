// One `db` for the whole api. Which engine backs it is decided once, here:
//   - tests                 -> PGlite in memory (fresh per test file)
//   - no DATABASE_URL       -> PGlite on disk in api/.data/pglite (zero setup)
//   - DATABASE_URL set      -> real Postgres over node-postgres (Neon, Supabase, Render, local…)
// Everything else only sees the Drizzle query builder, so swapping is one env var.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { env, repoRoot } from "../env";
import * as schema from "./schema";

export { schema };

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbKind = "pglite" | "postgres";

export const pgliteDataDir = path.join(repoRoot, "api", ".data", "pglite");

function connect(): { db: Db; kind: DbKind; close: () => Promise<void> } {
  if (!env.isTest && env.DATABASE_URL) {
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const db = drizzleNodePg({ client: pool, schema, casing: "snake_case" });
    return { db, kind: "postgres", close: () => pool.end() };
  }
  // PGlite creates the leaf folder but not its parents.
  if (!env.isTest) mkdirSync(pgliteDataDir, { recursive: true });
  const client = new PGlite(env.isTest ? undefined : pgliteDataDir);
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  return { db, kind: "pglite", close: () => client.close() };
}

const conn = connect();

export const db: Db = conn.db;
export const dbKind: DbKind = conn.kind;
export const closeDb = conn.close;
