// Runs once per test file: fresh in-memory PGlite, schema applied.
import { runMigrations } from "../src/db/migrate";

await runMigrations();
