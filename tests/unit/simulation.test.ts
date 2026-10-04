import { beforeAll, describe, expect, it } from "vitest";

import { MARGIN_TARGET, PLANS, SIMULATION } from "@/config/economics";
import { checkPlan, recommendation, type PlanCheck } from "@/lib/billing/pricing";
import { runGeneralSimulation, runVolumeSimulation, type SimulationSummary } from "@/lib/simulation/run";

/*
 * Step 5: 1,000 conversations through the real reply pipeline (Claude
 * stood in for, tokens counted from the real requests), then every plan at
 * its full allowance. Fails when a paid plan's simulated margin — monthly or
 * annual — drops below MARGIN_TARGET. `npm run simulate` prints the report.
 */

const f = (v: number, d = 2) => v.toFixed(d);
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

let report: SimulationSummary;
const plans: PlanCheck[] = [];

beforeAll(async () => {
  report = await runGeneralSimulation();
  for (const plan of PLANS) {
    const volume = await runVolumeSimulation(plan.aiConversationsPerMonth);
    plans.push(
      checkPlan({
        planId: plan.id,
        price: plan.monthlyPrice,
        conversations: plan.aiConversationsPerMonth,
        costPerConversation: volume.worst.costPerConversationFcfa,
        repliesPerConversation: volume.worst.repliesPerConversation,
      }),
    );
  }
  const t = report.tokensPerRequest;
  console.log(
    [
      `[simulation] ${report.conversations} conversations (${Object.entries(report.byLanguage).map(([k, v]) => `${k} ${v}`).join(", ")}), ${report.customerMessages} customer messages`,
      `  assistant messages per conversation: ${f(report.repliesPerConversation)} (max ${report.maxReplies}; ${pct(report.within4Replies)} of conversations ≤ 4)`,
      `  answered by rules: ${pct(report.rulesShare)} of replies; Claude requests per Claude reply: ${f(report.claudeRequestsPerReply)}`,
      `  tokens per Claude request: ${f(t.input, 0)} input, ${f(t.cacheRead, 0)} cache read, ${f(t.cacheWrite, 0)} cache write, ${f(t.output, 0)} output`,
      `  cache hit rate: ${pct(report.cacheHitRate)} of requests`,
      `  Claude cost per conversation: ${f(report.costPerConversationFcfa.mean)} FCFA (median ${f(report.costPerConversationFcfa.p50)}, p90 ${f(report.costPerConversationFcfa.p90)}, max ${f(report.costPerConversationFcfa.max)}); on Sonnet ${f(report.sonnetCostPerConversationFcfa)}`,
      `  by industry: ${Object.entries(report.byIndustry).map(([k, v]) => `${k} ${f(v.costPerConversationFcfa)} FCFA / ${f(v.repliesPerConversation, 1)} msgs / rules ${pct(v.rulesShare)}`).join("; ")}`,
      `  skipped without Claude: ${Object.entries(report.skipped).map(([k, v]) => `${k} ${v}`).join(", ")}; handed to the team: ${report.handedOver}`,
      `  Meta: ~${report.conversationsWithinMetaFree} conversations a month fit in the free 1,000 service messages`,
      ...plans.map(
        (p) =>
          `  ${p.planId.padEnd(8)} ${p.price} FCFA, ${p.conversations} conv. @ ${f(p.costPerConversation)} FCFA → Claude ${f(p.claudeAtFullUse, 0)} FCFA, margin ${pct(p.margin)} (annual ${pct(p.annualMargin)}), headroom ${p.headroom ? f(p.headroom, 1) : "—"}×, Meta est. ${f(p.meta.estimateFcfa, 0)} FCFA — ${recommendation(p)}`,
      ),
    ].join("\n"),
  );
}, 180_000);

describe(`simulation of ${SIMULATION.conversations} conversations`, () => {
  it("runs every conversation through the pipeline without a rejected reply", () => {
    expect(report.conversations).toBe(SIMULATION.conversations);
    expect(Object.keys(report.byIndustry)).toEqual(["retail", "restaurant", "salon", "real_estate"]);
    expect(Object.keys(report.byLanguage).sort()).toEqual(["en", "fr", "wes"]);
    expect(report.checkFailures).toBe(0);
  });

  it("meets the Step 3 targets: ≤ 4 assistant messages per conversation, ≥ 40% answered by rules", () => {
    expect(report.repliesPerConversation).toBeLessThanOrEqual(4);
    expect(report.rulesShare).toBeGreaterThanOrEqual(0.4);
  });

  it("reuses the prompt cache and skips messages Claude needn't read", () => {
    expect(report.cacheHitRate).toBeGreaterThan(0.5);
    expect(report.skipped.emoji_only).toBeGreaterThan(0);
    expect(report.skipped.repeat).toBeGreaterThan(0);
    expect(report.skipped.newer_message).toBeGreaterThan(0);
  });
});

describe("plan margins at full allowance", () => {
  it(`every paid plan keeps at least ${MARGIN_TARGET * 100}% margin, monthly and annual`, () => {
    const paid = plans.filter((p) => p.price > 0);
    expect(paid.length).toBe(PLANS.filter((p) => p.monthlyPrice > 0).length);
    for (const p of paid) {
      expect({ plan: p.planId, monthly: p.margin! >= MARGIN_TARGET, annual: p.annualMargin! >= MARGIN_TARGET }).toEqual({ plan: p.planId, monthly: true, annual: true });
    }
  });
});

describe("pricing calculator", () => {
  it("computes margin, budget and the lowest safe price", () => {
    const c = checkPlan({ planId: "x", price: 10_000, conversations: 1_000, costPerConversation: 4, repliesPerConversation: 3 });
    expect(c.claudeAtFullUse).toBe(4_000);
    expect(c.margin).toBeCloseTo((10_000 - 300 - 4_000) / 10_000);
    // Annual: 10,000 × 10/12 = 8,333 a month → can carry 8,333 × 0.37 = 3,083 of Claude: 4,000 is too much.
    expect(c.ok).toBe(false);
    expect(c.minPrice).toBe(13_000);
    expect(c.maxConversations).toBe(750);
    expect(c.meta).toEqual({ replies: 3_000, overFree: 2_000, estimateFcfa: expect.closeTo(2_000 * 0.004 * 570) });
    expect(checkPlan({ ...c, price: c.minPrice }).ok).toBe(true);
  });

  it("checks Free against its hidden budget, not a margin", () => {
    const c = checkPlan({ planId: "free", price: 0, conversations: 50, costPerConversation: 8, repliesPerConversation: 3 });
    expect(c.margin).toBeNull();
    expect(c.ok).toBe(false);
    expect(c.maxConversations).toBe(37);
  });
});
