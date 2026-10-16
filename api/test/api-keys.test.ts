import type { Item, PublicUser } from "@mvp/shared";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { jsonInit, ORIGIN, signUp } from "./helpers";

type CreatedKey = { id: string; key: string; name: string | null; start: string | null };

async function createKey(cookie: string, name = "ci key") {
  const res = await app.request("/api/auth/api-key/create", jsonInit({ name }, { cookie }));
  if (res.status !== 200) throw new Error(`create key failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as CreatedKey;
}

describe("API keys", () => {
  it("a key acts as its owner on protected routes", async () => {
    const { user, cookie } = await signUp(app);
    const created = await createKey(cookie);
    expect(created.key).toMatch(/^mvp_/);
    expect(created.start).toBe(created.key.slice(0, 6));

    const me = await app.request("/api/me", { headers: { "x-api-key": created.key } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as PublicUser).email).toBe(user.email);

    const made = await app.request("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": created.key },
      body: JSON.stringify({ title: "from a script" }),
    });
    expect(made.status).toBe(201);
    const item = (await made.json()) as Item;

    // …and the browser session sees what the script created.
    const list = await app.request("/api/items", { headers: { cookie } });
    expect(((await list.json()) as { items: Item[] }).items.map((i) => i.id)).toContain(item.id);
  });

  it("rejects unknown or malformed keys", async () => {
    for (const bad of ["mvp_definitely-not-a-key", "garbage", ""]) {
      const res = await app.request("/api/me", { headers: { "x-api-key": bad } });
      expect(res.status, `key=${JSON.stringify(bad)}`).toBe(401);
    }
  });

  it("lists keys without exposing the secret, and deleting revokes access", async () => {
    const { cookie } = await signUp(app);
    const created = await createKey(cookie, "to be deleted");

    const list = await app.request("/api/auth/api-key/list", { headers: { cookie } });
    expect(list.status).toBe(200);
    const { apiKeys } = (await list.json()) as { apiKeys: Record<string, unknown>[]; total: number };
    expect(apiKeys.some((k) => k.id === created.id)).toBe(true);
    for (const k of apiKeys) expect(k).not.toHaveProperty("key");

    const del = await app.request("/api/auth/api-key/delete", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({ keyId: created.id }),
    });
    expect(del.status).toBe(200);

    const after = await app.request("/api/me", { headers: { "x-api-key": created.key } });
    expect(after.status).toBe(401);
  });

  it("is not rate limited (plugin default would be 10/day)", async () => {
    const { cookie } = await signUp(app);
    const { key } = await createKey(cookie, "busy");
    for (let i = 0; i < 12; i++) {
      const res = await app.request("/api/me", { headers: { "x-api-key": key } });
      expect(res.status, `request #${i + 1}`).toBe(200);
    }
  });

  it("requires a name and refuses anonymous key creation", async () => {
    const anon = await app.request("/api/auth/api-key/create", jsonInit({ name: "x" }));
    expect(anon.status).toBe(401);

    const { cookie } = await signUp(app);
    const unnamed = await app.request("/api/auth/api-key/create", jsonInit({}, { cookie }));
    expect(unnamed.status).toBeGreaterThanOrEqual(400);
  });
});
