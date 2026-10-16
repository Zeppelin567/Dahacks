import type { Item, ItemList } from "@mvp/shared";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { jsonInit, signUp } from "./helpers";

async function create(cookie: string, body: Record<string, unknown>) {
  const res = await app.request("/api/items", jsonInit(body, { cookie }));
  return { res, item: res.status === 201 ? ((await res.json()) as Item) : null };
}

describe("items CRUD", () => {
  it("requires auth on every route", async () => {
    for (const [method, path] of [
      ["GET", "/api/items"],
      ["POST", "/api/items"],
      ["GET", "/api/items/00000000-0000-4000-8000-000000000001"],
      ["PATCH", "/api/items/00000000-0000-4000-8000-000000000001"],
      ["DELETE", "/api/items/00000000-0000-4000-8000-000000000001"],
    ] as const) {
      const hasBody = method === "POST" || method === "PATCH";
      const res = await app.request(path, {
        method,
        headers: hasBody ? { "content-type": "application/json" } : {},
        body: hasBody ? "{}" : undefined,
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("creates, reads, updates and deletes an item", async () => {
    const { cookie } = await signUp(app);

    const { res, item } = await create(cookie, { title: "  Ship it  ", notes: "tonight" });
    expect(res.status).toBe(201);
    if (!item) throw new Error("no item");
    expect(item.title).toBe("Ship it"); // trimmed by the schema
    expect(item.status).toBe("todo");
    expect(item.notes).toBe("tonight");

    const got = await app.request(`/api/items/${item.id}`, { headers: { cookie } });
    expect(got.status).toBe(200);
    expect(((await got.json()) as Item).id).toBe(item.id);

    const patched = await app.request(`/api/items/${item.id}`, {
      ...jsonInit({ status: "done" }, { cookie }),
      method: "PATCH",
    });
    expect(patched.status).toBe(200);
    const after = (await patched.json()) as Item;
    expect(after.status).toBe("done");
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(item.updatedAt).getTime());

    const del = await app.request(`/api/items/${item.id}`, { method: "DELETE", headers: { cookie } });
    expect(del.status).toBe(204);

    const gone = await app.request(`/api/items/${item.id}`, { headers: { cookie } });
    expect(gone.status).toBe(404);
  });

  it("validates input", async () => {
    const { cookie } = await signUp(app);
    const empty = await create(cookie, { title: "   " });
    expect(empty.res.status).toBe(400);
    expect(await empty.res.json()).toMatchObject({ error: "validation_error" });

    const badStatus = await create(cookie, { title: "x", status: "later" });
    expect(badStatus.res.status).toBe(400);

    const badId = await app.request("/api/items/not-a-uuid", { headers: { cookie } });
    expect(badId.status).toBe(400);
  });

  it("scopes items to their owner", async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    const { item } = await create(alice.cookie, { title: "alice's" });
    await create(bob.cookie, { title: "bob's" });
    if (!item) throw new Error("no item");

    const bobList = (await (
      await app.request("/api/items", { headers: { cookie: bob.cookie } })
    ).json()) as ItemList;
    expect(bobList.total).toBe(1);
    expect(bobList.items[0]?.title).toBe("bob's");

    // Bob cannot see, edit or delete Alice's item — and learns nothing about it.
    const peek = await app.request(`/api/items/${item.id}`, { headers: { cookie: bob.cookie } });
    expect(peek.status).toBe(404);
    const edit = await app.request(`/api/items/${item.id}`, {
      ...jsonInit({ title: "hijack" }, { cookie: bob.cookie }),
      method: "PATCH",
    });
    expect(edit.status).toBe(404);
    const del = await app.request(`/api/items/${item.id}`, {
      method: "DELETE",
      headers: { cookie: bob.cookie },
    });
    expect(del.status).toBe(404);
  });

  it("filters by status and title", async () => {
    const { cookie } = await signUp(app);
    await create(cookie, { title: "Write pitch", status: "done" });
    await create(cookie, { title: "Record video", status: "todo" });
    await create(cookie, { title: "Write README", status: "todo" });

    const done = (await (
      await app.request("/api/items?status=done", { headers: { cookie } })
    ).json()) as ItemList;
    expect(done.items.map((i) => i.title)).toEqual(["Write pitch"]);

    const write = (await (
      await app.request("/api/items?q=write", { headers: { cookie } })
    ).json()) as ItemList;
    expect(write.total).toBe(2);
  });

  it("is fully documented", async () => {
    const spec = (await (await app.request("/api/openapi.json")).json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(Object.keys(spec.paths["/api/items"] ?? {}).sort()).toEqual(["get", "post"]);
    expect(Object.keys(spec.paths["/api/items/{id}"] ?? {}).sort()).toEqual(["delete", "get", "patch"]);
    expect(Object.keys(spec.components.schemas)).toEqual(
      expect.arrayContaining(["Item", "CreateItem", "UpdateItem", "ItemList", "ItemStatus"]),
    );
  });
});
