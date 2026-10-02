import "server-only";

import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CLAUDE_FALLBACK_RATES, CLAUDE_RATES, FCFA_PER_USD, type ClaudeRates } from "@/config/economics";

/** Token counts of one Messages API request, as the API reports them. */
export type ClaudeCallUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
};

/** Rates for a model id; dated ids ("claude-haiku-4-5-20251001") match their alias. */
export function claudeRates(model: string): { rates: ClaudeRates; known: boolean } {
  const key = Object.keys(CLAUDE_RATES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model === k || model.startsWith(`${k}-`));
  return key ? { rates: CLAUDE_RATES[key], known: true } : { rates: CLAUDE_FALLBACK_RATES, known: false };
}

export function claudeCostUsd(call: ClaudeCallUsage): number {
  const { rates } = claudeRates(call.model);
  return (
    (call.inputTokens * rates.input +
      call.outputTokens * rates.output +
      call.cacheReadTokens * rates.cacheRead +
      call.cacheWrite5mTokens * rates.cacheWrite5m +
      call.cacheWrite1hTokens * rates.cacheWrite1h) /
    1_000_000
  );
}

export const usdToFcfa = (usd: number) => usd * FCFA_PER_USD;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Writes one claude_calls row per Messages API request (never message content). */
export async function logClaudeCalls(
  admin: Admin,
  businessId: string,
  calls: ClaudeCallUsage[],
  opts: { source: "reply" | "test_chat"; aiUsageId?: string | null },
) {
  if (!calls.length) return;
  const rows = calls.map((c, i) => {
    const usd = claudeCostUsd(c);
    return {
      business_id: businessId,
      ai_usage_id: opts.aiUsageId ?? null,
      source: opts.source,
      model: c.model.slice(0, 80),
      step: i + 1,
      input_tokens: c.inputTokens,
      output_tokens: c.outputTokens,
      cache_read_tokens: c.cacheReadTokens,
      cache_write_5m_tokens: c.cacheWrite5mTokens,
      cache_write_1h_tokens: c.cacheWrite1hTokens,
      cost_usd: Number(usd.toFixed(6)),
      cost_fcfa: Number(usdToFcfa(usd).toFixed(4)),
      rate_known: claudeRates(c.model).known,
    };
  });
  const { error } = await admin.from("claude_calls").insert(rows);
  if (error) logServerError("billing.claudeCalls", error);
}
