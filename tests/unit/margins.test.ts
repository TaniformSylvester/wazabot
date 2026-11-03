import { describe, expect, it } from "vitest";

import { businessMargin, planConfigDrift, planMargins, reportMonth, type CostRow } from "@/lib/billing/margins";

const row = (o: Partial<CostRow>): CostRow => ({
  business_id: "b1",
  business_name: "Awa Styles",
  plan_id: "business",
  subscription_status: "active",
  claude_reply_fcfa: 0,
  claude_test_fcfa: 0,
  claude_usd: 0,
  claude_requests: 0,
  ai_conversations: 0,
  service_sent: 0,
  service_over_free: 0,
  utility_sent: 0,
  marketing_sent: 0,
  ...o,
});

describe("margin report", () => {
  it("works out a paid business's margin after Claude and the Mobile Money fee: plan + AI add-on", () => {
    // Business + AI Basic (bundle) 11 500 FCFA: fee 345, Claude 2 000 → (11 500 − 2 000 − 345) / 11 500
    const b = businessMargin(row({ claude_reply_fcfa: 1800, claude_test_fcfa: 200, ai_conversations: 100 }), "month", "ai_basic");
    expect(b.revenue).toBe(11_500);
    expect(b.paymentFees).toBe(345);
    expect(b.margin).toBeCloseTo((11_500 - 2_000 - 345) / 11_500, 6);
    expect(b.flagged).toBe(false);
    expect(b.claudePerConversation).toBe(18); // replies only, not test chat
    // The Claude budget comes from what the AI earns (11 500 − 7 500), not the whole price.
    expect(b.budget).toBe(1_480);
  });

  it("a plan without the AI add-on has no Claude budget: any Claude spend is over it", () => {
    const b = businessMargin(row({ claude_reply_fcfa: 10 }));
    expect(b).toMatchObject({ revenue: 7_500, budget: 0, overBudget: true });
  });

  it("flags a paid business below 60%, and a trial that costs money without paying", () => {
    expect(businessMargin(row({ plan_id: "boutique", claude_reply_fcfa: 4_000 }), "month", "ai_basic").flagged).toBe(true); // (8 000 − 240 − 4 000) / 8 000 = 47%
    expect(businessMargin(row({ plan_id: "boutique", claude_reply_fcfa: 4_000 }), "month", "ai_basic").overBudget).toBe(true);
    const trial = businessMargin(row({ subscription_status: "trialing", claude_reply_fcfa: 50 }));
    expect(trial.revenue).toBe(0);
    expect(trial.margin).toBeNull();
    expect(trial.flagged).toBe(true);
  });

  it("no plan (read-only) earns nothing and has no margin", () => {
    const none = businessMargin(row({ plan_id: "free" }));
    expect(none).toMatchObject({ revenue: 0, margin: null, flagged: false, budget: 0, overBudget: false });
    const plans = planMargins([none, businessMargin(row({ business_id: "b2", claude_reply_fcfa: 1_000 }), "month", "ai_basic")]);
    expect(plans.find((p) => p.planId === "free")).toMatchObject({ businesses: 1, paying: 0, margin: null });
    expect(plans.find((p) => p.planId === "business")?.margin).toBeCloseTo((11_500 - 1_000 - 345) / 11_500, 6);
  });

  it("estimates Meta's bill to the business: service over the free tier, utility, marketing", () => {
    // (100 × 0.004 + 10 × 0.004 + 20 × 0.0225) × 570 = (0.4 + 0.04 + 0.45) × 570 = 507.3
    const b = businessMargin(row({ service_sent: 1_100, service_over_free: 100, utility_sent: 10, marketing_sent: 20 }));
    expect(b.metaEstimate).toBeCloseTo(507.3, 2);
  });

  it("reads the month and spots plans that differ from the config", () => {
    expect(reportMonth("2026-09", new Date("2026-10-02T00:00:00Z"))).toBe("2026-09-01");
    expect(reportMonth("2026-13", new Date("2026-10-02T00:00:00Z"))).toBe("2026-10-01");
    expect(reportMonth(undefined, new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-01");
    const db = [
      { id: "free", monthly_price: 0, ai_conversations_per_month: 0 },
      { id: "boutique", monthly_price: 3_000, ai_conversations_per_month: 0 },
      { id: "business", monthly_price: 9_000, ai_conversations_per_month: 0 },
    ];
    expect(planConfigDrift(db)).toEqual(["business", "multishop"]);
    // Docs and School entitlements are compared when read.
    const boutique = { id: "boutique", monthly_price: 3_000, ai_conversations_per_month: 0, max_documents: null, max_students: 200, max_report_card_students: 200, max_teachers: 30, has_bulk_report_cards: true, has_school_reports: false };
    expect(planConfigDrift([boutique]).includes("boutique")).toBe(false);
    expect(planConfigDrift([{ ...boutique, max_documents: 25 }]).includes("boutique")).toBe(true);
    expect(planConfigDrift([{ ...boutique, has_school_reports: true }]).includes("boutique")).toBe(true);
  });
});

describe("yearly plans in the margin report", () => {
  it("count 10/12 of the price as monthly revenue, against the smaller yearly budget", async () => {
    const { businessMargin } = await import("@/lib/billing/margins");
    const row = { business_id: "b", business_name: "B", plan_id: "business", subscription_status: "active", claude_reply_fcfa: 1000, claude_test_fcfa: 0, claude_usd: 0, claude_requests: 1, ai_conversations: 10, service_sent: 0, service_over_free: 0, utility_sent: 0, marketing_sent: 0 };
    const m = businessMargin(row, "year", "ai_plus");
    // Business + AI Plus: 19 500 a month → 16 250 on the annual price; the AI's 12 000 → 10 000.
    expect(m.revenue).toBeCloseTo(16_250, 1);
    expect(m.budget).toBe(3_700);
    expect(m.margin).toBeCloseTo((16_250 - 487.5 - 1000) / 16_250, 3);
  });
});
