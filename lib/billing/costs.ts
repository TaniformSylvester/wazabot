import "server-only";

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
