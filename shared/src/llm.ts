import { z } from "@hono/zod-openapi";

export const LLM_PROVIDERS = ["anthropic", "openai", "google", "mock"] as const;
export const LlmProviderSchema = z.enum(LLM_PROVIDERS).openapi("LlmProvider");
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

/** GET /api/chat/status — which model the chat endpoint will actually use. */
export const LlmStatusSchema = z
  .object({
    provider: LlmProviderSchema,
    model: z.string().openapi({ example: "claude-opus-5" }),
    /** True when no real provider is configured and replies are synthesized locally. */
    mock: z.boolean(),
    /** Why mock mode is active (e.g. "ANTHROPIC_API_KEY is not set"). */
    reason: z.string().optional(),
    /** The provider that was requested when mock mode kicked in. */
    requested: LlmProviderSchema.optional(),
  })
  .openapi("LlmStatus");
export type LlmStatus = z.infer<typeof LlmStatusSchema>;
