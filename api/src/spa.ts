// Serves the built SPA (web/dist) from the api in production so there is a
// single deployable process and no CORS. Anything under /api/* is left alone
// so unknown API paths still get the JSON 404 from app.notFound().
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Env, Hono, Schema } from "hono";

export function mountSpa<E extends Env, S extends Schema, P extends string>(
  app: Hono<E, S, P>,
  distDir: string,
) {
  // serveStatic resolves `root` against process.cwd(), so make it relative.
  const root = path.relative(process.cwd(), distDir) || ".";
  const files = serveStatic({ root });
  const index = serveStatic({ root, rewriteRequestPath: () => "/index.html" });

  app.use("/*", (c, next) => (c.req.path.startsWith("/api/") ? next() : files(c, next)));
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : index(c, next)));
}
