import { afterEach, describe, expect, it, vi } from "vitest";
import { mapApp } from "../src/map-app";

afterEach(() => vi.unstubAllGlobals());

describe("public map deployment", () => {
  it("exposes health while keeping starter APIs and Python helpers private", async () => {
    expect((await mapApp.request("/api/health")).status).toBe(200);
    for (const path of ["/api/items", "/api/auth/get-session", "/api/py/whoami", "/api/py/text/stats"]) {
      expect((await mapApp.request(path)).status).toBe(404);
    }
  });

  it("forwards route payloads and query strings without browser credentials", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response('{"mock":false}', {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const body = JSON.stringify({ mode: "green", rural: 0.6 });
    const response = await mapApp.request("/api/py/bikemap/route?example=1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "session=private",
        authorization: "Bearer private",
        "x-api-key": "private",
        "x-user-id": "private",
      },
      body,
    });
    expect(response.status).toBe(200);
    const call = upstream.mock.calls[0];
    if (!call) throw new Error("Proxy did not call the routing service");
    const [url, init] = call;
    expect(url).toBe("http://localhost:8000/bikemap/route?example=1");
    expect(init.method).toBe("POST");
    for (const name of ["cookie", "authorization", "x-api-key", "x-user-id"]) {
      expect(init.headers.has(name)).toBe(false);
    }
    expect(await new Response(init.body).text()).toBe(body);
  });

  it("returns a retryable error when the routing process is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const response = await mapApp.request("/api/py/bikemap/places");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "map_unavailable" });
  });
});
