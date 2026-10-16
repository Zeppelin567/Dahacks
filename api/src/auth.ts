// Better Auth instance. Mounted at /api/auth/* by app.ts; everything else
// only calls `auth.api.*` through middleware/auth.ts.
// See AUTH.md for how a request turns into a user.
import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { db, schema } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Origins allowed to make state-changing calls. In dev the browser is on
  // the Vite origin; in production web and api share the api origin.
  trustedOrigins: [env.WEB_ORIGIN],
  // No cookieCache: every request hits the session table, so sign-out and
  // revocation take effect immediately. Enable it only if DB latency matters.
  plugins: [
    // API keys for scripts, bots and hardware. Keys are hashed at rest and
    // shown to the user exactly once. Verification happens in
    // middleware/auth.ts (requireAuth), not via enableSessionForAPIKeys.
    apiKey({
      apiKeyHeaders: "x-api-key",
      defaultPrefix: "mvp_",
      requireName: true,
      // The plugin default is 10 requests per DAY per key — useless for a demo.
      rateLimit: { enabled: false },
      keyExpiration: { defaultExpiresIn: null },
    }),
  ],
});

export type Auth = typeof auth;
