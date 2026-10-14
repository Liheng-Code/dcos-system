// The real model call for the Activity Library assistant (server only). Structured outputs, not forced tool use:
// Sonnet 5.5 returns a 400 for tool_choice any/tool, and the answer is a validated JSON object either way.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ModelCall } from "./ai-run";

const TIMEOUT_MS = 90_000;

export const aiKeyConfigured = (): boolean => !!process.env.ANTHROPIC_API_KEY;

/** PLAN_AI_MODEL overrides the default model id (the organisation setting overrides both). */
export const aiDefaultModel = (): string | undefined => process.env.PLAN_AI_MODEL?.trim() || undefined;

export const callClaude: ModelCall = async ({ model, system, user, schema, maxTokens }) => {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const stream = client.beta.messages.stream({
    model,
    max_tokens: maxTokens,
    // on a policy decline the API re-runs the request on Anthropic's recommended fallback model
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // short, bounded answers: low effort keeps the cost of a suggestion small
    output_config: { effort: "low", format: zodOutputFormat(schema as never) },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();
  return {
    parsed: message.stop_reason === "end_turn" ? ((message as { parsed_output?: unknown }).parsed_output ?? null) : null,
    input_tokens: (message.usage?.input_tokens ?? 0) + (message.usage?.cache_creation_input_tokens ?? 0),
    output_tokens: message.usage?.output_tokens ?? 0,
    refused: message.stop_reason === "refusal",
    truncated: message.stop_reason === "max_tokens",
  };
};
