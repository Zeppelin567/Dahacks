import type { PublicUser } from "@mvp/shared";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { ORIGIN, signIn, signUp } from "./helpers";

describe("auth", () => {
  it("rejects anonymous access to protected routes", async () => {
    const res = await app.request("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("signs up, then the cookie identifies the user", async () => {
    const { user, cookie } = await signUp(app);
    expect(cookie).toContain("better-auth.session_token=");

    const me = await app.request("/api/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as PublicUser;
    expect(body.email).toBe(user.email);
    expect(body.name).toBe(user.name);
    expect(body.id).toBeTruthy();
  });

  it("signs in with the right password and rejects the wrong one", async () => {
    const { user } = await signUp(app);

    const bad = await signIn(app, user.email, "nope-nope-nope");
    expect(bad.res.status).toBe(401);

    const good = await signIn(app, user.email, user.password);
    expect(good.res.status).toBe(200);
    const me = await app.request("/api/me", { headers: { cookie: good.cookie } });
    expect(me.status).toBe(200);
  });

  it("sign-out invalidates the session", async () => {
    const { cookie } = await signUp(app);
    const out = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: ORIGIN },
    });
    expect(out.status).toBe(200);

    const me = await app.request("/api/me", { headers: { cookie } });
    expect(me.status).toBe(401);
  });

  it("enforces the minimum password length", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ name: "Short", email: `short-${Date.now()}@example.com`, password: "1234567" }),
    });
    expect(res.status).toBe(400);
  });

  it("documents /api/me with security schemes", async () => {
    const spec = (await (await app.request("/api/openapi.json")).json()) as {
      paths: Record<string, { get?: { security?: unknown[] } }>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(spec.paths["/api/me"]?.get?.security).toBeDefined();
    expect(Object.keys(spec.components.securitySchemes)).toEqual(
      expect.arrayContaining(["cookieAuth", "apiKey"]),
    );
  });
});
