// Used by `npm run db:generate` (drizzle-kit generate) to turn schema.ts
// into SQL migrations under api/drizzle/. Migrations are applied at server
// start by src/db/migrate.ts, so no database connection is needed here.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
