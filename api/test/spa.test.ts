import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mountSpa } from "../src/spa";

// Production-only behaviour, so it is tested against a throwaway dist folder
// rather than the real web/dist.
describe("SPA serving", () => {
  let dist: string;
  let app: Hono;

  beforeAll(() => {
    dist = mkdtempSync(path.join(tmpdir(), "mvp-dist-"));
    mkdirSync(path.join(dist, "assets"));
    writeFileSync(path.join(dist, "index.html"), '<!doctype html><div id="root"></div>');
    writeFileSync(path.join(dist, "assets", "app.js"), "console.log('hi')");

    app = new Hono();
    app.get("/api/health", (c) => c.json({ ok: true }));
    mountSpa(app, dist);
    app.notFound((c) => c.json({ error: "not_found" }, 404));
  });

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it("serves index.html at /", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('id="root"');
  });

  it("serves real files", async () => {
    const res = await app.request("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("falls back to index.html for client-side routes", async () => {
    const res = await app.request("/app/items/42");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
  });

  it("never swallows /api/* paths", async () => {
    const ok = await app.request("/api/health");
    expect(await ok.json()).toEqual({ ok: true });

    const missing = await app.request("/api/nope");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });
});
