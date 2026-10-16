import type { Health } from "@mvp/shared";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";

describe("system", () => {
  it("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Health;
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
  });

  it("serves the OpenAPI spec and the docs page", async () => {
    const spec = await app.request("/api/openapi.json");
    expect(spec.status).toBe(200);
    const json = (await spec.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(json.openapi).toBe("3.1.0");
    expect(json.paths["/api/health"]).toBeDefined();

    const docs = await app.request("/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
  });

  it("unknown /api routes return JSON 404", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });
});
