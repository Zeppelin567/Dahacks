// In-process pub/sub for WebSocket clients. One server = one hub; if you ever
// run several api instances you would back this with Redis, but a hackathon
// never needs that.
import { PRIVATE_CHANNELS, SERVER_EVENTS, type Sender, type ServerMessage } from "@mvp/shared";
import type { User } from "../types";

export type Socket = { send(data: string): void; close(code?: number, reason?: string): void };

export type Client = {
  socket: Socket;
  user: Pick<User, "id" | "name">;
  channels: Set<string>;
};

const clients = new Set<Client>();

function frame(type: string, channel: string, payload: unknown): string {
  const msg: ServerMessage = { type, channel, payload };
  return JSON.stringify(msg);
}

function safeSend(client: Client, data: string) {
  try {
    client.socket.send(data);
  } catch {
    clients.delete(client);
  }
}

export function sender(user: Pick<User, "id" | "name">): Sender {
  return { id: user.id, name: user.name };
}

export function register(socket: Socket, user: User): Client {
  const client: Client = { socket, user: sender(user), channels: new Set() };
  clients.add(client);
  safeSend(client, frame(SERVER_EVENTS.hello, "system", { user: client.user, clients: clients.size }));
  broadcastPresence();
  return client;
}

export function unregister(client: Client) {
  if (clients.delete(client)) broadcastPresence();
}

export function subscribe(client: Client, channel: string) {
  client.channels.add(channel);
  safeSend(client, frame(SERVER_EVENTS.subscribed, channel, { clients: countOn(channel) }));
}

export function unsubscribe(client: Client, channel: string) {
  client.channels.delete(channel);
  safeSend(client, frame(SERVER_EVENTS.unsubscribed, channel, null));
}

export function sendError(client: Client, message: string) {
  safeSend(client, frame(SERVER_EVENTS.error, "system", { message }));
}

export function sendTo(client: Client, type: string, channel: string, payload: unknown) {
  safeSend(client, frame(type, channel, payload));
}

/**
 * Push an event to everyone subscribed to `channel`.
 * Private channels (see PRIVATE_CHANNELS) require `toUser` and reach only that
 * user's connections; passing `toUser` for a public channel narrows it the same way.
 */
export function publish(channel: string, type: string, payload: unknown, opts: { toUser?: string } = {}) {
  if (PRIVATE_CHANNELS.has(channel) && !opts.toUser) {
    throw new Error(`channel "${channel}" is private; publish() needs { toUser }`);
  }
  const data = frame(type, channel, payload);
  let delivered = 0;
  for (const client of clients) {
    if (!client.channels.has(channel)) continue;
    if (opts.toUser && client.user.id !== opts.toUser) continue;
    safeSend(client, data);
    delivered += 1;
  }
  return delivered;
}

function countOn(channel: string) {
  let n = 0;
  for (const c of clients) if (c.channels.has(channel)) n += 1;
  return n;
}

function broadcastPresence() {
  const data = frame(SERVER_EVENTS.presence, "system", { clients: clients.size });
  for (const client of clients) safeSend(client, data);
}

export function stats() {
  const channels: Record<string, number> = {};
  for (const c of clients) for (const ch of c.channels) channels[ch] = (channels[ch] ?? 0) + 1;
  return { clients: clients.size, channels };
}

/** Test helper: drop every connection. */
export function resetHub() {
  for (const c of clients) {
    try {
      c.socket.close(1001, "server reset");
    } catch {
      // already gone
    }
  }
  clients.clear();
}
