import { describe, expect, it } from "vitest";

import { MARGIN_TARGET, MOBILE_MONEY_FEE_RATE, PLANS, claudeBudgetFcfa } from "@/config/economics";
import { claudeCostUsd, claudeRates, usdToFcfa } from "@/lib/billing/costs";

const call = (model: string, t: Partial<Record<"inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWrite5mTokens" | "cacheWrite1hTokens", number>>) => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  ...t,
});

describe("Claude costs", () => {
  it("prices Haiku 4.5 per token kind", () => {
    // 1M of each: $1 input + $5 output + $0.10 cache read + $1.25 5-min write + $2 1-hour write
    const usd = claudeCostUsd(call("claude-haiku-4-5", { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6, cacheWrite5mTokens: 1e6, cacheWrite1hTokens: 1e6 }));
    expect(usd).toBeCloseTo(9.35, 6);
    expect(usdToFcfa(1)).toBe(570);
  });

  it("matches dated model ids to their alias, and over-reports unknown models", () => {
    expect(claudeRates("claude-haiku-4-5-20251001")).toMatchObject({ known: true, rates: { input: 1 } });
    expect(claudeRates("claude-sonnet-5-5")).toMatchObject({ known: true, rates: { input: 2, output: 10 } });
    const unknown = claudeRates("some-new-model");
    expect(unknown.known).toBe(false);
    expect(unknown.rates.output).toBeGreaterThanOrEqual(20);
  });

  it("derives each paid plan's Claude budget from the margin target", () => {
    for (const plan of PLANS.filter((p) => p.monthlyPrice > 0)) {
      const budget = claudeBudgetFcfa(plan);
      const margin = (plan.monthlyPrice - plan.monthlyPrice * MOBILE_MONEY_FEE_RATE - budget) / plan.monthlyPrice;
      expect(margin).toBeGreaterThanOrEqual(MARGIN_TARGET);
    }
    expect(claudeBudgetFcfa({ id: "starter", monthlyPrice: 10_000 })).toBe(3_700);
    expect(claudeBudgetFcfa({ id: "free", monthlyPrice: 0 })).toBe(300);
  });
});
