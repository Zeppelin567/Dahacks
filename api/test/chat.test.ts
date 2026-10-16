import type { LlmStatus } from "@mvp/shared";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { DEFAULT_MODELS, resolveLlm, toStatus } from "../src/llm";
import { jsonInit, signUp } from "./helpers";

const userMessage = (text: string) => ({ id: "u1", role: "user", parts: [{ type: "text", text }] });

describe("LLM config", () => {
  const base = {
    LLM_PROVIDER: "anthropic" as const,
    LLM_MODEL: undefined,
    ANTHROPIC_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  };

  it("falls back to mock when the provider's key is missing", () => {
    const cfg = resolveLlm(base);
    expect(cfg).toMatchObject({ provider: "mock", mock: true, requested: "anthropic" });
    expect(cfg.reason).toContain("ANTHROPIC_API_KEY");
  });

  it("uses the provider with its default model when the key is present", () => {
    const cfg = resolveLlm({ ...base, ANTHROPIC_API_KEY: "sk-test" });
    expect(cfg).toMatchObject({ provider: "anthropic", model: DEFAULT_MODELS.anthropic, mock: false });
    expect(DEFAULT_MODELS.anthropic).toBe("claude-opus-5");
  });

  it("honours LLM_MODEL and LLM_PROVIDER, and never leaks the key", () => {
    const cfg = resolveLlm({ ...base, LLM_PROVIDER: "openai", OPENAI_API_KEY: "k", LLM_MODEL: "my-model" });
    expect(cfg).toMatchObject({ provider: "openai", model: "my-model" });
    expect(toStatus(cfg)).not.toHaveProperty("apiKey");

    expect(resolveLlm({ ...base, LLM_PROVIDER: "mock", ANTHROPIC_API_KEY: "k" }).mock).toBe(true);
  });
});

describe("chat endpoint", () => {
  it("requires auth", async () => {
    expect((await app.request("/api/chat/status")).status).toBe(401);
    expect((await app.request("/api/chat", jsonInit({ messages: [userMessage("hi")] }))).status).toBe(401);
  });

  it("reports mock mode in the test environment", async () => {
    const { cookie } = await signUp(app);
    const res = await app.request("/api/chat/status", { headers: { cookie } });
    expect(res.status).toBe(200);
    const status = (await res.json()) as LlmStatus;
    expect(status.mock).toBe(true);
    expect(status).not.toHaveProperty("apiKey");
  });

  it("rejects malformed message arrays", async () => {
    const { cookie } = await signUp(app);
    const empty = await app.request("/api/chat", jsonInit({ messages: [] }, { cookie }));
    expect(empty.status).toBe(400);
    const junk = await app.request("/api/chat", jsonInit({ messages: [{ nope: true }] }, { cookie }));
    expect(junk.status).toBe(400);
  });

  it("streams a UI message stream that echoes the user in mock mode", async () => {
    const { cookie } = await signUp(app);
    const res = await app.request(
      "/api/chat",
      jsonInit({ messages: [userMessage("hello mock")] }, { cookie }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain('"type":"text-start"');
    expect(body).toContain('"type":"text-delta"');
    expect(body).toContain('"type":"finish"');
    // Deltas are word-sized; reassemble them to check the content.
    const text = [...body.matchAll(/"delta":"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => JSON.parse(`"${m[1]}"`))
      .join("");
    expect(text).toContain("hello mock");
    expect(text).toContain("Mock mode");
  });

  it("documents both chat routes", async () => {
    const spec = (await (await app.request("/api/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };
    expect(spec.paths["/api/chat"]).toBeDefined();
    expect(spec.paths["/api/chat/status"]).toBeDefined();
  });
});
