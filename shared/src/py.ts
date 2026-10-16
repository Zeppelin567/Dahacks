import { z } from "@hono/zod-openapi";

/** GET /api/py/status — is the optional Python side-car reachable? */
export const PyStatusSchema = z
  .object({
    up: z.boolean(),
    url: z.string().openapi({ example: "http://localhost:8000" }),
    version: z.string().optional(),
    hint: z.string().optional().openapi({ example: "Start it with: npm run dev:py" }),
  })
  .openapi("PyStatus");
export type PyStatus = z.infer<typeof PyStatusSchema>;
