// Public BikeMap deployment: avoid booting the starter auth/database stack.
// The full application remains available through npm start.
import path from "node:path";
import { Hono } from "hono";
import { env, repoRoot } from "./env";
import { mountSpa } from "./spa";

export const mapApp = new Hono();
mapApp.get("/api/health", (c) => c.json({ ok: true, service: "bikemap-web" }));
mapApp.all("/api/py/*", async (c) => {
  const url = new URL(c.req.url);
  const targetPath = url.pathname.slice("/api/py".length);
  // Only the public map API and health endpoint belong on this deployment.
  if (targetPath !== "/health" && !targetPath.startsWith("/bikemap/")) {
    return c.json({ error: "not_found" }, 404);
  }
  const headers = new Headers(c.req.raw.headers);
  for (const key of [
    "host",
    "connection",
    "content-length",
    "cookie",
    "authorization",
    "x-api-key",
    "x-user-id",
    "x-user-email",
  ]) {
    headers.delete(key);
  }
  try {
    const hasBody = !["GET", "HEAD"].includes(c.req.method);
    const upstream = await fetch(`${env.PY_URL.replace(/\/$/, "")}${targetPath}${url.search}`, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
    } as RequestInit);
    const out = new Headers(upstream.headers);
    for (const key of ["connection", "transfer-encoding", "content-length", "content-encoding"])
      out.delete(key);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return c.json(
      { error: "map_unavailable", message: "Map service is starting. Please try again shortly." },
      503,
    );
  }
});
mountSpa(mapApp, path.join(repoRoot, "web", "dist"));
mapApp.notFound((c) => c.json({ error: "not_found" }, 404));
