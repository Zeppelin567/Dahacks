import type { Item, ServerMessage } from "@mvp/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { resetHub } from "../src/realtime/hub";
import { startServer } from "../src/server";
import { jsonInit, signUp } from "./helpers";

// The WebSocket path needs a real socket, so this file boots the server on a
// random port (unlike the HTTP tests, which use app.request()).
let base = "";
let wsBase = "";
let stop: () => Promise<void>;

beforeAll(async () => {
  const s = await startServer(0);
  base = `http://localhost:${s.port}`;
  wsBase = `ws://localhost:${s.port}`;
  stop = s.close;
});

afterAll(async () => {
  resetHub();
  await stop();
});

/** Connect and collect frames; `next()` resolves with the next frame matching `type`. */
function connect(headers: Record<string, string>) {
  const ws = new WebSocket(`${wsBase}/api/ws`, { headers });
  const queue: ServerMessage[] = [];
  const waiters: ((m: ServerMessage) => void)[] = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw)) as ServerMessage;
    const w = waiters.shift();
    if (w) w(msg);
    else queue.push(msg);
  });

  const opened = new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.once("error", reject);
  });

  function next(type: string, timeoutMs = 3000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for "${type}"`)), timeoutMs);
      const check = (m: ServerMessage) => {
        if (m.type === type) {
          clearTimeout(timer);
          resolve(m);
        } else {
          waiters.push(check);
        }
      };
      const queued = queue.findIndex((m) => m.type === type);
      if (queued >= 0) {
        clearTimeout(timer);
        resolve(queue.splice(queued, 1)[0] as ServerMessage);
      } else {
        waiters.push(check);
      }
    });
  }

  const send = (m: unknown) => ws.send(JSON.stringify(m));
  const sendRaw = (s: string) => ws.send(s);
  const close = () =>
    new Promise<void>((r) => {
      if (ws.readyState !== WebSocket.OPEN) return r();
      ws.once("close", () => r());
      ws.close();
    });
  return { ws, opened, next, send, sendRaw, close };
}

const http = (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);

describe("realtime", () => {
  it("rejects anonymous connections with 401", async () => {
    const c = connect({});
    await expect(c.opened).rejects.toThrow("HTTP 401");
  });

  it("greets an authenticated browser (cookie) and a script (api key)", async () => {
    const { cookie } = await signUp(app());
    const browser = connect({ cookie });
    await browser.opened;
    const hello = await browser.next("hello");
    expect((hello.payload as { user: { id: string } }).user.id).toBeTruthy();

    const keyRes = await http("/api/auth/api-key/create", jsonInit({ name: "ws" }, { cookie }));
    const { key } = (await keyRes.json()) as { key: string };
    const script = connect({ "x-api-key": key });
    await script.opened;
    const hello2 = await script.next("hello");
    expect((hello2.payload as { clients: number }).clients).toBeGreaterThanOrEqual(2);

    await browser.close();
    await script.close();
  });

  it("delivers items events only to the owner's connections", async () => {
    const alice = await signUp(app());
    const bob = await signUp(app());
    const a1 = connect({ cookie: alice.cookie });
    const a2 = connect({ cookie: alice.cookie });
    const b = connect({ cookie: bob.cookie });
    await Promise.all([a1.opened, a2.opened, b.opened]);
    for (const c of [a1, a2, b]) {
      c.send({ type: "subscribe", channel: "items" });
      await c.next("subscribed");
    }

    const created = await http("/api/items", jsonInit({ title: "live!" }, { cookie: alice.cookie }));
    expect(created.status).toBe(201);
    const item = (await created.json()) as Item;

    const [e1, e2] = await Promise.all([a1.next("items.created"), a2.next("items.created")]);
    expect((e1.payload as Item).id).toBe(item.id);
    expect((e2.payload as Item).title).toBe("live!");
    await expect(b.next("items.created", 300)).rejects.toThrow("timed out");

    await http(`/api/items/${item.id}`, { method: "DELETE", headers: { cookie: alice.cookie } });
    expect(((await a1.next("items.deleted")).payload as { id: string }).id).toBe(item.id);

    await Promise.all([a1.close(), a2.close(), b.close()]);
  });

  it("relays user messages on public channels and refuses private ones", async () => {
    const alice = await signUp(app(), { name: "Alice" });
    const bob = await signUp(app());
    const a = connect({ cookie: alice.cookie });
    const b = connect({ cookie: bob.cookie });
    await Promise.all([a.opened, b.opened]);
    b.send({ type: "subscribe", channel: "demo" });
    await b.next("subscribed");

    a.send({ type: "publish", channel: "demo", payload: { hi: "there" } });
    const relayed = await b.next("message");
    expect(relayed.channel).toBe("demo");
    expect(relayed.payload).toMatchObject({ from: { name: "Alice" }, data: { hi: "there" } });

    a.send({ type: "publish", channel: "items", payload: {} });
    expect(((await a.next("error")).payload as { message: string }).message).toMatch(/server-only/);

    a.sendRaw("not json");
    expect(((await a.next("error")).payload as { message: string }).message).toMatch(/JSON/);

    a.send({ type: "ping" });
    expect((await a.next("pong")).channel).toBe("system");

    await Promise.all([a.close(), b.close()]);
  });
});

/** helpers.signUp wants something with .request(); adapt it to real HTTP. */
function app() {
  return { request: (path: string, init?: RequestInit) => http(path, init) };
}
