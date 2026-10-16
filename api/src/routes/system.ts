import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HealthSchema } from "@mvp/shared";
import { sql } from "drizzle-orm";
import { db, dbKind } from "../db";
import type { AppEnv } from "../types";

export const VERSION = "0.1.0";

const healthRoute = createRoute({
  method: "get",
  path: "/api/health",
  tags: ["system"],
  summary: "Liveness check",
  responses: {
    200: { description: "API is up", content: { "application/json": { schema: HealthSchema } } },
  },
});

export const system = new OpenAPIHono<AppEnv>().openapi(healthRoute, async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ ok: true as const, version: VERSION, time: new Date().toISOString(), db: dbKind }, 200);
});
