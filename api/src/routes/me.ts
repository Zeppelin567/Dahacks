import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { ErrorSchema, UserSchema } from "@mvp/shared";
import { authSecurity, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const meRoute = createRoute({
  method: "get",
  path: "/api/me",
  tags: ["auth"],
  summary: "Current user",
  description: "Who the request is authenticated as (session cookie or x-api-key).",
  security: authSecurity,
  middleware: [requireAuth],
  responses: {
    200: { description: "Signed-in user", content: { "application/json": { schema: UserSchema } } },
    401: { description: "Not signed in", content: { "application/json": { schema: ErrorSchema } } },
  },
});

export const me = new OpenAPIHono<AppEnv>().openapi(meRoute, (c) => {
  const u = c.var.user;
  return c.json(
    {
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image ?? null,
      createdAt: u.createdAt.toISOString(),
    },
    200,
  );
});
