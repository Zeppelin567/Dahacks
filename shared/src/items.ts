import { z } from "@hono/zod-openapi";

export const ITEM_STATUSES = ["todo", "doing", "done"] as const;
export const ItemStatusSchema = z.enum(ITEM_STATUSES).openapi("ItemStatus", { example: "todo" });
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

/** What the api returns. Dates are ISO strings on the wire. */
export const ItemSchema = z
  .object({
    id: z.uuid().openapi({ example: "3f7c2c2e-8b1e-4a4e-9c0a-1d2e3f4a5b6c" }),
    ownerId: z.string().openapi({ example: "u_01J8Z6…" }),
    title: z.string().openapi({ example: "Ship the demo" }),
    notes: z.string().nullable().openapi({ example: "Record a backup video first." }),
    status: ItemStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Item");
export type Item = z.infer<typeof ItemSchema>;

/** Body for POST /api/items. */
export const CreateItemSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().max(5000).nullable().optional(),
    status: ItemStatusSchema.optional(),
  })
  .openapi("CreateItem");
export type CreateItem = z.infer<typeof CreateItemSchema>;

/** Body for PATCH /api/items/{id} — any subset of the create fields. */
export const UpdateItemSchema = CreateItemSchema.partial().openapi("UpdateItem");
export type UpdateItem = z.infer<typeof UpdateItemSchema>;

export const ItemIdParamsSchema = z.object({
  id: z.uuid().openapi({ param: { name: "id", in: "path" } }),
});

export const ListItemsQuerySchema = z.object({
  status: ItemStatusSchema.optional(),
  /** Case-insensitive substring match on title. */
  q: z.string().trim().min(1).optional(),
});
export type ListItemsQuery = z.infer<typeof ListItemsQuerySchema>;

export const ItemListSchema = z
  .object({
    items: z.array(ItemSchema),
    total: z.number().int().openapi({ example: 3 }),
  })
  .openapi("ItemList");
export type ItemList = z.infer<typeof ItemListSchema>;
