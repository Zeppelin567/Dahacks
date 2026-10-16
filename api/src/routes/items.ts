// The CRUD template. Every route: validated by the shared Zod schemas,
// documented in /docs, scoped to the signed-in user, typed end-to-end for web/.
// To add your own resource: copy this file, rename `items`, adjust the schemas
// in shared/src/items.ts and the table in db/schema.ts.
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  CHANNELS,
  CreateItemSchema,
  ErrorSchema,
  ItemIdParamsSchema,
  ItemListSchema,
  ItemSchema,
  ListItemsQuerySchema,
  SERVER_EVENTS,
  UpdateItemSchema,
} from "@mvp/shared";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { authSecurity, requireAuth } from "../middleware/auth";
import { publish } from "../realtime/hub";
import type { AppEnv } from "../types";

type ItemRow = typeof schema.items.$inferSelect;

/** DB row → wire shape (dates as ISO strings). */
function toDto(row: ItemRow) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const json = <T>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const notFound = json(ErrorSchema, "Item not found (or not yours)");
const unauthorized = json(ErrorSchema, "Sign in required");

// ---------------------------------------------------------------------------
// Route definitions (the OpenAPI half)
// ---------------------------------------------------------------------------
const listRoute = createRoute({
  method: "get",
  path: "/api/items",
  tags: ["items"],
  summary: "List my items",
  security: authSecurity,
  middleware: [requireAuth],
  request: { query: ListItemsQuerySchema },
  responses: { 200: json(ItemListSchema, "Items owned by the caller, newest first"), 401: unauthorized },
});

const createItemRoute = createRoute({
  method: "post",
  path: "/api/items",
  tags: ["items"],
  summary: "Create an item",
  security: authSecurity,
  middleware: [requireAuth],
  request: { body: { content: { "application/json": { schema: CreateItemSchema } }, required: true } },
  responses: {
    201: json(ItemSchema, "Created"),
    400: json(ErrorSchema, "Validation error"),
    401: unauthorized,
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/api/items/{id}",
  tags: ["items"],
  summary: "Get one item",
  security: authSecurity,
  middleware: [requireAuth],
  request: { params: ItemIdParamsSchema },
  responses: { 200: json(ItemSchema, "The item"), 401: unauthorized, 404: notFound },
});

const updateRoute = createRoute({
  method: "patch",
  path: "/api/items/{id}",
  tags: ["items"],
  summary: "Update an item",
  security: authSecurity,
  middleware: [requireAuth],
  request: {
    params: ItemIdParamsSchema,
    body: { content: { "application/json": { schema: UpdateItemSchema } }, required: true },
  },
  responses: {
    200: json(ItemSchema, "Updated"),
    400: json(ErrorSchema, "Validation error"),
    401: unauthorized,
    404: notFound,
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/items/{id}",
  tags: ["items"],
  summary: "Delete an item",
  security: authSecurity,
  middleware: [requireAuth],
  request: { params: ItemIdParamsSchema },
  responses: { 204: { description: "Deleted" }, 401: unauthorized, 404: notFound },
});

// ---------------------------------------------------------------------------
// Handlers (the Drizzle half)
// ---------------------------------------------------------------------------
export const items = new OpenAPIHono<AppEnv>()
  .openapi(listRoute, async (c) => {
    const { status, q } = c.req.valid("query");
    const where: SQL[] = [eq(schema.items.ownerId, c.var.user.id)];
    if (status) where.push(eq(schema.items.status, status));
    if (q) where.push(ilike(schema.items.title, `%${q}%`));

    const rows = await db
      .select()
      .from(schema.items)
      .where(and(...where))
      .orderBy(desc(schema.items.createdAt));
    return c.json({ items: rows.map(toDto), total: rows.length }, 200);
  })
  .openapi(createItemRoute, async (c) => {
    const body = c.req.valid("json");
    const [row] = await db
      .insert(schema.items)
      .values({ ...body, notes: body.notes ?? null, ownerId: c.var.user.id })
      .returning();
    if (!row) throw new Error("insert returned no row");
    const dto = toDto(row);
    // Every open tab of this user learns about it immediately.
    publish(CHANNELS.items, SERVER_EVENTS.itemCreated, dto, { toUser: row.ownerId });
    return c.json(dto, 201);
  })
  .openapi(getRoute, async (c) => {
    const { id } = c.req.valid("param");
    const [row] = await db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.id, id), eq(schema.items.ownerId, c.var.user.id)));
    if (!row) return c.json({ error: "not_found", message: "Item not found" }, 404);
    return c.json(toDto(row), 200);
  })
  .openapi(updateRoute, async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const [row] = await db
      .update(schema.items)
      .set(patch)
      .where(and(eq(schema.items.id, id), eq(schema.items.ownerId, c.var.user.id)))
      .returning();
    if (!row) return c.json({ error: "not_found", message: "Item not found" }, 404);
    const dto = toDto(row);
    publish(CHANNELS.items, SERVER_EVENTS.itemUpdated, dto, { toUser: row.ownerId });
    return c.json(dto, 200);
  })
  .openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await db
      .delete(schema.items)
      .where(and(eq(schema.items.id, id), eq(schema.items.ownerId, c.var.user.id)))
      .returning({ id: schema.items.id });
    if (deleted.length === 0) return c.json({ error: "not_found", message: "Item not found" }, 404);
    publish(CHANNELS.items, SERVER_EVENTS.itemDeleted, { id }, { toUser: c.var.user.id });
    return c.body(null, 204);
  });
