// Builds the Hono app. Kept separate from index.ts so tests can call
// `app.request()` without opening a port.
import { existsSync } from "node:fs";
import path from "node:path";
import { OpenAPIHono } from "@hono/zod-openapi";
import { ErrorSchema } from "@mvp/shared";
import { Scalar } from "@scalar/hono-api-reference";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { env, repoRoot } from "./env";
import { realtime } from "./realtime/ws";
import { chat } from "./routes/chat";
import { items } from "./routes/items";
import { me } from "./routes/me";
import { py } from "./routes/py";
import { system, VERSION } from "./routes/system";
import { mountSpa } from "./spa";
import type { AppEnv } from "./types";

export const app = new OpenAPIHono<AppEnv>({
  // Turn Zod validation failures into the same error shape as everything else.
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "validation_error",
          message: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        },
        400,
      );
    }
  },
});

if (!env.isTest) app.use(logger());

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message || "http_error", message: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal_error", message: env.isProd ? "Internal error" : String(err) }, 500);
});

// ---------------------------------------------------------------------------
// Auth: Better Auth owns everything under /api/auth/* (sign-up, sign-in,
// sign-out, get-session, …). Same-origin in both dev (Vite proxy) and prod.
// ---------------------------------------------------------------------------
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// ---------------------------------------------------------------------------
// Routes. Each module is its own OpenAPIHono in src/routes/; chaining them
// here gives `AppType` the full route map for the typed client in web/.
// ---------------------------------------------------------------------------
export const routes = app.route("/", system).route("/", me).route("/", items).route("/", chat).route("/", py);

/** Type of the whole API, consumed by `hc<AppType>()` in web/. */
export type AppType = typeof routes;

// WebSocket endpoint (GET /api/ws). Mounted outside the typed chain: it is not
// an HTTP resource and has no OpenAPI entry.
app.route("/", realtime);

// ---------------------------------------------------------------------------
// OpenAPI spec + interactive docs.
// ---------------------------------------------------------------------------
app.openAPIRegistry.register("Error", ErrorSchema);
app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description: "Browser session cookie set by /api/auth/sign-in/email",
});
app.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
  type: "apiKey",
  in: "header",
  name: "x-api-key",
  description: "API key created at /app/api-keys (for scripts, bots, hardware)",
});
app.doc31("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "MVP Demo API",
    version: VERSION,
    description:
      "Generated from the Zod schemas in shared/. Auth endpoints live under /api/auth/* (Better Auth).",
  },
});
app.get(
  "/docs",
  Scalar({
    pageTitle: "MVP Demo API",
    // Two documents in one page: this api, and the Python side-car's (proxied).
    sources: [
      { title: "API", slug: "api", url: "/api/openapi.json", default: true },
      { title: "Python service", slug: "python", url: "/api/py/openapi.json" },
    ],
  }),
);

// Unknown /api/* paths get JSON, not HTML.
app.notFound((c) =>
  c.json({ error: "not_found", message: `No route for ${c.req.method} ${c.req.path}` }, 404),
);

// ---------------------------------------------------------------------------
// In production the API also serves the built SPA from web/dist.
// ---------------------------------------------------------------------------
const webDist = path.join(repoRoot, "web", "dist");
if (!env.isDev && !env.isTest && existsSync(webDist)) mountSpa(app, webDist);
