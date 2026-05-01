import Anthropic from "@anthropic-ai/sdk";

/**
 * Phase A's only supported provider. Multi-provider is icebox.
 */
export const PHASE_A_PROVIDER = "anthropic" as const;

/**
 * Phase A default model. Sonnet 4.6 is a deliberate choice for cost-bounded
 * evaluation of a research workbench; swap to `claude-opus-4-7` for the
 * higher-quality runs the failure gallery (PR 9) leans on.
 *
 * The skill guidance defaults to opus 4.7; we are honoring the explicit
 * user choice (Phase A meta issue) of sonnet 4.6 while keeping the model
 * a single env var away from a swap.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-6";

export type AnthropicMessagesCreate = (
  body: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export interface ModelConfig {
  provider: typeof PHASE_A_PROVIDER;
  model: string;
  /**
   * Resolved client.messages.create function. Tests inject a fake; production
   * reads ANTHROPIC_API_KEY from the environment.
   */
  messagesCreate: AnthropicMessagesCreate;
}

/**
 * Read the model config from process.env. Returns null when the key is
 * missing — the caller turns that into a 503 so the rest of the workbench
 * stays usable without an API key (patient search, FHIR proxy, etc.).
 */
export function modelConfigFromEnv(): ModelConfig | null {
  const apiKey =
    process.env.WORKBENCH_AGENT_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.WORKBENCH_AGENT_MODEL ?? DEFAULT_MODEL;
  const baseURL = process.env.WORKBENCH_AGENT_BASE_URL;
  const client = new Anthropic({ apiKey, baseURL });
  return {
    provider: PHASE_A_PROVIDER,
    model,
    messagesCreate: (body) => client.messages.create(body),
  };
}
