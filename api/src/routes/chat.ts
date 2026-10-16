// Streaming chat. The browser uses the AI SDK's useChat() which POSTs the
// whole UIMessage[] history and reads back a UI message stream (SSE).
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { ErrorSchema, LlmStatusSchema } from "@mvp/shared";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { env } from "../env";
import { CHAT_INSTRUCTIONS, languageModel, resolveLlm, toStatus } from "../llm";
import { authSecurity, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const statusRoute = createRoute({
  method: "get",
  path: "/api/chat/status",
  tags: ["chat"],
  summary: "Which LLM the chat uses",
  description: "Reports provider/model, and whether mock mode is active because no API key is configured.",
  security: authSecurity,
  middleware: [requireAuth],
  responses: {
    200: {
      description: "Current LLM configuration",
      content: { "application/json": { schema: LlmStatusSchema } },
    },
    401: { description: "Sign in required", content: { "application/json": { schema: ErrorSchema } } },
  },
});

const base = new OpenAPIHono<AppEnv>();

// Hand-written OpenAPI entry for the streaming route: its response is
// text/event-stream, not JSON, so it cannot go through `.openapi()`.
base.openAPIRegistry.registerPath({
  method: "post",
  path: "/api/chat",
  tags: ["chat"],
  summary: "Stream a chat completion",
  description:
    "Body: `{ messages: UIMessage[] }` (AI SDK UI message format). Response: `text/event-stream` of UI message chunks. " +
    "Use the AI SDK `useChat()` hook or `DefaultChatTransport` on the client.",
  security: authSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { messages: { type: "array", items: { type: "object" } } },
            required: ["messages"],
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "UI message stream",
      content: { "text/event-stream": { schema: { type: "string" } } },
    },
    400: { description: "Invalid messages" },
    401: { description: "Sign in required" },
  },
});

export const chat = base
  .openapi(statusRoute, (c) => c.json(toStatus(resolveLlm()), 200))
  .post("/api/chat", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { messages?: unknown } | null;
    const validated = await safeValidateUIMessages({ messages: body?.messages ?? [] });
    if (!validated.success) {
      return c.json({ error: "validation_error", message: validated.error.message }, 400);
    }
    const messages = validated.data;
    if (messages.length === 0) {
      return c.json({ error: "validation_error", message: "messages must not be empty" }, 400);
    }

    const cfg = resolveLlm();
    if (cfg.mock) return mockReply(messages);

    const result = streamText({
      model: languageModel(cfg),
      instructions: CHAT_INSTRUCTIONS,
      messages: await convertToModelMessages(messages),
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        // Surface provider errors (bad key, model not found) in the UI instead of a silent stop.
        onError: (error) => (error instanceof Error ? error.message : String(error)),
      }),
    });
  });

/** Local stand-in when no provider key is set: echoes the last user message, streamed word by word. */
function mockReply(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const said =
    lastUser?.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim() ?? "";

  const reply =
    `Mock mode: no LLM API key is configured, so this reply is generated locally. ` +
    `You said: "${said}". ` +
    `Set ANTHROPIC_API_KEY (or OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY with LLM_PROVIDER) in .env and restart the api to talk to a real model.`;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = "mock-text";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      for (const chunk of reply.split(/(?<=\s)/)) {
        writer.write({ type: "text-delta", id, delta: chunk });
        if (!env.isTest) await new Promise((r) => setTimeout(r, 15));
      }
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
