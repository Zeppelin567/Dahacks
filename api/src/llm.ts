// Which LLM the chat endpoint talks to. One env var (LLM_PROVIDER) picks the
// vendor, LLM_MODEL overrides the model id, and the matching *_API_KEY must be
// present — otherwise we fall back to a local mock so the app still runs.
// The Vercel AI SDK gives every provider the same streaming interface.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmProvider, LlmStatus } from "@mvp/shared";
import type { LanguageModel } from "ai";
import { env } from "./env";

type RealProvider = Exclude<LlmProvider, "mock">;

/**
 * Defaults per vendor. Anthropic's is current as of this repo; the other two
 * change often — check the vendor's model list and set LLM_MODEL explicitly.
 */
export const DEFAULT_MODELS: Record<RealProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5",
  google: "gemini-2.5-flash",
};

const KEY_VAR: Record<RealProvider, "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GOOGLE_GENERATIVE_AI_API_KEY"> =
  {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
  };

export type LlmEnv = Pick<
  typeof env,
  "LLM_PROVIDER" | "LLM_MODEL" | "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GOOGLE_GENERATIVE_AI_API_KEY"
>;

export type LlmConfig = LlmStatus & { apiKey?: string };

/** Pure: decide provider/model/mock from env-like input (tests pass their own). */
export function resolveLlm(e: LlmEnv = env): LlmConfig {
  if (e.LLM_PROVIDER === "mock") {
    return { provider: "mock", model: "mock", mock: true, reason: "LLM_PROVIDER=mock" };
  }
  const keyVar = KEY_VAR[e.LLM_PROVIDER];
  const apiKey = e[keyVar];
  if (!apiKey) {
    return {
      provider: "mock",
      model: "mock",
      mock: true,
      reason: `${keyVar} is not set`,
      requested: e.LLM_PROVIDER,
    };
  }
  return {
    provider: e.LLM_PROVIDER,
    model: e.LLM_MODEL ?? DEFAULT_MODELS[e.LLM_PROVIDER],
    mock: false,
    apiKey,
  };
}

/** Strip the secret before sending the config to the browser. */
export function toStatus(cfg: LlmConfig): LlmStatus {
  const { apiKey: _omit, ...status } = cfg;
  return status;
}

/** Build the AI SDK model for a non-mock config. */
export function languageModel(cfg: LlmConfig): LanguageModel {
  switch (cfg.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: cfg.apiKey })(cfg.model);
    case "openai":
      return createOpenAI({ apiKey: cfg.apiKey })(cfg.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(cfg.model);
    case "mock":
      throw new Error("mock mode has no language model; handle it before calling languageModel()");
  }
}

/** System prompt for the demo chat. Edit freely — it is the product's voice. */
export const CHAT_INSTRUCTIONS =
  "You are the assistant inside a hackathon demo app. Be concise and concrete. " +
  "Use plain text (no Markdown tables). If you do not know something, say so.";
