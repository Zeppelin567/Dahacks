import { z } from "@hono/zod-openapi";

/** The public shape of a signed-in user, as returned by GET /api/me. */
export const UserSchema = z
  .object({
    id: z.string().openapi({ example: "u_01J8Z6…" }),
    name: z.string().openapi({ example: "Ada Lovelace" }),
    email: z.email().openapi({ example: "ada@example.com" }),
    image: z.string().nullable().optional().openapi({ example: null }),
    createdAt: z.iso.datetime().openapi({ example: "2026-09-13T00:00:00.000Z" }),
  })
  .openapi("User");
export type PublicUser = z.infer<typeof UserSchema>;
