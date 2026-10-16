import { z } from "@hono/zod-openapi";

// Wire format for /api/ws. Every frame is JSON with the same three fields:
//   { type, channel, payload }
// Clients subscribe to channels; the server pushes typed events into them.
// Private topics (like "items") are delivered only to the owning user's
// connections; public topics (like "demo") reach every subscriber.

export const ChannelNameSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "lowercase letters, digits, . _ - (max 64)")
  .openapi("ChannelName", { example: "items" });
export type ChannelName = z.infer<typeof ChannelNameSchema>;

/** What a client may send. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), channel: ChannelNameSchema }),
  z.object({ type: z.literal("unsubscribe"), channel: ChannelNameSchema }),
  /** Broadcast an arbitrary payload to everyone on a public channel. */
  z.object({ type: z.literal("publish"), channel: ChannelNameSchema, payload: z.unknown() }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Sender attached to user-published messages. */
export const SenderSchema = z.object({ id: z.string(), name: z.string() });
export type Sender = z.infer<typeof SenderSchema>;

/** What the server sends. `type` is open-ended so modules can add events. */
export const ServerMessageSchema = z.object({
  type: z.string(),
  channel: z.string(),
  payload: z.unknown(),
});
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Server event types the starter emits. Extend freely. */
export const SERVER_EVENTS = {
  hello: "hello", // on connect: { user: Sender, clients: number }
  presence: "presence", // channel "system": { clients: number }
  subscribed: "subscribed",
  unsubscribed: "unsubscribed",
  message: "message", // user-published: { from: Sender, sentAt: string, data: unknown }
  pong: "pong",
  error: "error", // { message: string }
  itemCreated: "items.created",
  itemUpdated: "items.updated",
  itemDeleted: "items.deleted", // { id: string }
} as const;

/** Channels the starter uses. Private ones are per-user; public ones are shared. */
export const CHANNELS = {
  system: "system",
  items: "items",
  demo: "demo",
} as const;
export const PRIVATE_CHANNELS: ReadonlySet<string> = new Set([CHANNELS.items]);
