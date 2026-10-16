// Reverse proxy to the optional Python side-car (py/). The browser and scripts
// only ever talk to this api; auth happens here, then the request is forwarded
// with x-user-id / x-user-email headers so Python knows who is calling.
//
//   /api/py/health, /api/py/openapi.json  → public (harmless, needed by the docs page)
//   /api/py/*                             → requireAuth, then forwarded
//   /api/py/status                        → typed JSON: is Python up?
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ErrorSchema, PyStatusSchema } from "@mvp/shared";
import type { Context } from "hono";
import { env } from "../env";
import { authSecurity, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const PREFIX = "/api/py";
const HINT = "Start it with: npm run dev:py (requires uv)";

// Overridable so tests can point the proxy at a throwaway upstream.
let pyUrl = env.PY_URL.replace(/\/$/, "");
export function setPyUrl(url: string) {
  pyUrl = url.replace(/\/$/, "");
}
export function getPyUrl() {
  return pyUrl;
}

const HOP_BY_HOP = ["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "content-length"];
// Never leak the caller's credentials to the side-car; identity goes as explicit headers instead.
const CREDENTIALS = ["cookie", "authorization", "x-api-key"];

function unavailable(c: Context<AppEnv>) {
  return c.json(
    { error: "python_unavailable", message: `Python service not reachable at ${pyUrl}. ${HINT}` },
    503,
  );
}

async function forward(c: Context<AppEnv>) {
  const incoming = new URL(c.req.url);
  const target = `${pyUrl}${incoming.pathname.slice(PREFIX.length) || "/"}${incoming.search}`;

  const headers = new Headers(c.req.raw.headers);
  for (const h of [...HOP_BY_HOP, ...CREDENTIALS]) headers.delete(h);
  const user = c.get("user");
  if (user) {
    headers.set("x-user-id", user.id);
    headers.set("x-user-email", user.email);
  } else {
    headers.delete("x-user-id");
    headers.delete("x-user-email");
  }

  const hasBody = !["GET", "HEAD"].includes(c.req.method);
  const init: RequestInit & { duplex?: "half" } = { method: c.req.method, headers, redirect: "manual" };
  if (hasBody) {
    init.body = c.req.raw.body;
    init.duplex = "half"; // required by Node's fetch for streamed request bodies
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return unavailable(c);
  }

  const out = new Headers(upstream.headers);
  for (const h of HOP_BY_HOP) out.delete(h);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

const statusRoute = createRoute({
  method: "get",
  path: "/api/py/status",
  tags: ["python"],
  summary: "Is the Python side-car running?",
  security: authSecurity,
  middleware: [requireAuth],
  responses: {
    200: {
      description: "Reachability of the Python service",
      content: { "application/json": { schema: PyStatusSchema } },
    },
    401: { description: "Sign in required", content: { "application/json": { schema: ErrorSchema } } },
  },
});

const base = new OpenAPIHono<AppEnv>();

base.openAPIRegistry.registerPath({
  method: "get",
  path: "/api/py/{path}",
  tags: ["python"],
  summary: "Proxy to the Python service",
  description:
    `Any method. Forwarded to \`PY_URL\` with the \`/api/py\` prefix removed and \`x-user-id\` / \`x-user-email\` ` +
    "headers added. Python's own OpenAPI document is at `/api/py/openapi.json`. Returns 503 when the service is down.",
  security: authSecurity,
  request: { params: z.object({ path: z.string().openapi({ param: { name: "path", in: "path" } }) }) },
  responses: {
    200: { description: "Whatever the Python route returns" },
    401: { description: "Sign in required" },
    503: { description: "Python service not running" },
  },
});

export const py = base
  .openapi(statusRoute, async (c) => {
    try {
      const res = await fetch(`${pyUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return c.json({ up: false, url: pyUrl, hint: `Health check returned ${res.status}` }, 200);
      const body = (await res.json()) as { version?: string };
      return c.json({ up: true, url: pyUrl, version: body.version }, 200);
    } catch {
      return c.json({ up: false, url: pyUrl, hint: HINT }, 200);
    }
  })
  .get("/api/py/health", forward)
  .get("/api/py/openapi.json", forward)
  // The bike map is public: riders don't sign in.
  .all("/api/py/bikemap/*", forward)
  .all("/api/py/*", requireAuth, forward);
