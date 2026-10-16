// Starts the HTTP + WebSocket server. index.ts uses it for real; tests call
// it with port 0 to get a throwaway server on a random port.
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { app } from "./app";

export function startServer(port: number) {
  const wss = new WebSocketServer({ noServer: true });
  return new Promise<{ server: ReturnType<typeof serve>; port: number; close: () => Promise<void> }>(
    (resolve) => {
      const server = serve({ fetch: app.fetch, port, websocket: { server: wss } }, (info: AddressInfo) => {
        resolve({
          server,
          port: info.port,
          close: () =>
            new Promise<void>((done) => {
              wss.close();
              server.close(() => done());
            }),
        });
      });
    },
  );
}
