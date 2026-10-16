// GET /api/ws — the WebSocket endpoint. Authenticated exactly like HTTP
// routes (cookie or x-api-key) because requireAuth runs before the upgrade.
import { upgradeWebSocket } from "@hono/node-server";
import { ClientMessageSchema, PRIVATE_CHANNELS, SERVER_EVENTS } from "@mvp/shared";
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import {
  type Client,
  publish,
  register,
  sendError,
  sender,
  sendTo,
  subscribe,
  unregister,
  unsubscribe,
} from "./hub";

export const realtime = new Hono<AppEnv>().get(
  "/api/ws",
  requireAuth,
  upgradeWebSocket((c) => {
    const user = c.var.user;
    let client: Client | undefined;

    return {
      onOpen(_evt, ws) {
        client = register({ send: (d) => ws.send(d), close: (code, reason) => ws.close(code, reason) }, user);
      },

      onMessage(evt, _ws) {
        if (!client) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(evt.data));
        } catch {
          return sendError(client, "frames must be JSON");
        }
        const msg = ClientMessageSchema.safeParse(parsed);
        if (!msg.success) return sendError(client, msg.error.issues.map((i) => i.message).join("; "));

        switch (msg.data.type) {
          case "subscribe":
            return subscribe(client, msg.data.channel);
          case "unsubscribe":
            return unsubscribe(client, msg.data.channel);
          case "ping":
            return sendTo(client, SERVER_EVENTS.pong, "system", { at: new Date().toISOString() });
          case "publish": {
            if (PRIVATE_CHANNELS.has(msg.data.channel)) {
              return sendError(client, `channel "${msg.data.channel}" is server-only`);
            }
            publish(msg.data.channel, SERVER_EVENTS.message, {
              from: sender(user),
              sentAt: new Date().toISOString(),
              data: msg.data.payload ?? null,
            });
            return;
          }
        }
      },

      onClose() {
        if (client) unregister(client);
        client = undefined;
      },

      onError() {
        if (client) unregister(client);
        client = undefined;
      },
    };
  }),
);
