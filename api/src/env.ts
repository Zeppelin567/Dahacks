// Loads the repo-root .env (if present) and validates every variable once.
// Import `env` from here; never read process.env elsewhere.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Absolute path of the monorepo root (the folder holding package.json + .env). */
export const repoRoot = path.resolve(here, "..", "..");

// Tests never touch the developer's .env; they run fully in memory.
if (process.env.NODE_ENV !== "test") {
  const envFile = path.join(repoRoot, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3000),

  /** Unset -> embedded PGlite in api/.data. Set -> any Postgres URL. */
  DATABASE_URL: z.string().min(1).optional(),

  BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-before-deploying"),
  /** Public URL of this API, as the browser reaches it. */
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  /** Origin of the Vite dev server (only needed in development). */
  WEB_ORIGIN: z.url().default("http://localhost:5173"),

  LLM_PROVIDER: z.enum(["anthropic", "openai", "google", "mock"]).default("anthropic"),
  LLM_MODEL: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),

  PY_URL: z.url().default("http://localhost:8000"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isDev: parsed.data.NODE_ENV === "development",
  isTest: parsed.data.NODE_ENV === "test",
  isProd: parsed.data.NODE_ENV === "production",
};
export type Env = typeof env;
