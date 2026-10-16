import { z } from "@hono/zod-openapi";

/** Shape of every error the api returns. */
export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "not_found" }),
    message: z.string().openapi({ example: "Item not found" }),
  })
  .openapi("Error");
export type ApiError = z.infer<typeof ErrorSchema>;

export const HealthSchema = z
  .object({
    ok: z.literal(true),
    version: z.string().openapi({ example: "0.1.0" }),
    time: z.iso.datetime().openapi({ example: "2026-09-13T00:00:00.000Z" }),
    db: z.enum(["pglite", "postgres"]).openapi({ description: "Which database engine is live" }),
  })
  .openapi("Health");
export type Health = z.infer<typeof HealthSchema>;
