// Turns the incoming request into `c.var.user` / `c.var.session`.
//
// Two credentials are accepted, in this order:
//   1. `x-api-key: mvp_…`  — verified with Better Auth's API-key plugin, then the
//                             owning user is loaded and a synthetic session built
//   2. session cookie       — Better Auth's normal getSession()
// Handlers never see the difference except through `c.var.authMethod`.
import type { ApiKey } from "@better-auth/api-key";
import type { RouteConfig } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
import { db, schema } from "../db";
import type { AppEnv, AuthMethod, Session, User } from "../types";

export const API_KEY_HEADER = "x-api-key";

type Identity = { user: User; session: Session; method: AuthMethod };

/** A session-shaped record for API-key callers, so downstream code is uniform. */
function sessionFromKey(key: Omit<ApiKey, "key">, userId: string): Session {
  return {
    id: `apikey_${key.id}`,
    userId,
    token: "",
    expiresAt: key.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    ipAddress: null,
    userAgent: `api-key:${key.name ?? key.id}`,
  };
}

export async function resolveIdentity(c: Context<AppEnv>): Promise<Identity | null> {
  const key = c.req.header(API_KEY_HEADER);
  if (key) {
    const result = await auth.api.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) return null;
    const [user] = await db.select().from(schema.user).where(eq(schema.user.id, result.key.referenceId));
    if (!user) return null;
    return { user, session: sessionFromKey(result.key, user.id), method: "apiKey" };
  }
  const data = await auth.api.getSession({ headers: c.req.raw.headers });
  return data ? { user: data.user, session: data.session, method: "cookie" } : null;
}

/** 401 unless the request carries a valid session cookie or API key. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const id = await resolveIdentity(c);
  if (!id) {
    return c.json({ error: "unauthorized", message: "Sign in or send a valid x-api-key" }, 401);
  }
  c.set("user", id.user);
  c.set("session", id.session);
  c.set("authMethod", id.method);
  await next();
});

/** Populates user/session when credentials are present; never blocks. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const id = await resolveIdentity(c);
  if (id) {
    c.set("user", id.user);
    c.set("session", id.session);
    c.set("authMethod", id.method);
  }
  await next();
});

/**
 * OpenAPI `security` for protected routes (cookie OR api key).
 * Declared with an explicit type on purpose: an inline two-entry array literal
 * gets normalised by TypeScript into a union with phantom `?: undefined` props,
 * which silently widens the whole route to `path: string` and breaks the RPC client.
 */
export const authSecurity: NonNullable<RouteConfig["security"]> = [{ cookieAuth: [] }, { apiKey: [] }];
