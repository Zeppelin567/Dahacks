import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PyStatus } from "@mvp/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { getPyUrl, setPyUrl } from "../src/routes/py";
import { jsonInit, signUp } from "./helpers";

// A stand-in for the FastAPI service: echoes what it received so we can
// assert on the proxy's behaviour without needing Python in CI.
let fake: Server;
const originalUrl = getPyUrl();

beforeAll(async () => {
  fake = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.url === "/health") {
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ ok: true, service: "fake", version: "9.9.9" }));
      }
      if (req.url === "/missing") {
        res.statusCode = 404;
        return res.end("nope");
      }
      res.setHeader("content-type", "application/json");
      res.setHeader("x-upstream", "fake-py");
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  setPyUrl(`http://127.0.0.1:${(fake.address() as AddressInfo).port}`);
});

afterAll(async () => {
  setPyUrl(originalUrl);
  await new Promise<void>((r) => fake.close(() => r()));
});

type Echo = { method: string; url: string; headers: Record<string, string>; body: string };

describe("python proxy", () => {
  it("requires auth for everything except health and openapi", async () => {
    expect((await app.request("/api/py/whoami")).status).toBe(401);
    expect((await app.request("/api/py/text/stats", jsonInit({ text: "x" }))).status).toBe(401);

    const health = await app.request("/api/py/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, service: "fake" });
  });

  it("forwards method, path, query, body and identity — but never credentials", async () => {
    const { user, cookie } = await signUp(app);
    // A bearer token is not something this api understands, so it must be dropped, not forwarded.
    // (An x-api-key header would be *consumed* by requireAuth first — see resolveIdentity.)
    const res = await app.request("/api/py/some/route?x=1&y=two", {
      ...jsonInit({ hello: "py" }, { cookie, authorization: "Bearer should-not-pass" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-upstream")).toBe("fake-py");
    const echo = (await res.json()) as Echo;
    expect(echo.method).toBe("POST");
    expect(echo.url).toBe("/some/route?x=1&y=two");
    expect(JSON.parse(echo.body)).toEqual({ hello: "py" });
    expect(echo.headers["content-type"]).toBe("application/json");
    expect(echo.headers["x-user-id"]).toBeTruthy();
    expect(echo.headers["x-user-email"]).toBe(user.email);
    expect(echo.headers).not.toHaveProperty("cookie");
    expect(echo.headers).not.toHaveProperty("authorization");
  });

  it("passes upstream status codes through", async () => {
    const { cookie } = await signUp(app);
    const res = await app.request("/api/py/missing", { headers: { cookie } });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("nope");
  });

  it("reports the service as up", async () => {
    const { cookie } = await signUp(app);
    const res = await app.request("/api/py/status", { headers: { cookie } });
    expect((await res.json()) as PyStatus).toMatchObject({ up: true, version: "9.9.9" });
  });

  it("answers 503 with a hint when Python is not running", async () => {
    const { cookie } = await signUp(app);
    const live = getPyUrl();
    setPyUrl("http://127.0.0.1:9"); // discard port — nothing listens
    try {
      const res = await app.request("/api/py/whoami", { headers: { cookie } });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: "python_unavailable" });

      const status = (await (
        await app.request("/api/py/status", { headers: { cookie } })
      ).json()) as PyStatus;
      expect(status.up).toBe(false);
      expect(status.hint).toContain("npm run dev:py");
    } finally {
      setPyUrl(live);
    }
  });
});
