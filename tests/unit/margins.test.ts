import { describe, expect, it } from "vitest";

import { businessMargin, planConfigDrift, planMargins, reportMonth, type CostRow } from "@/lib/billing/margins";

const row = (o: Partial<CostRow>): CostRow => ({
  business_id: "b1",
  business_name: "Awa Styles",
  plan_id: "starter",
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
  it("works out a paid business's margin after Claude and the Mobile Money fee", () => {
    // Starter 10 000 FCFA: fee 300, Claude 2 000 → (10 000 − 2 000 − 300) / 10 000 = 77%
    const b = businessMargin(row({ claude_reply_fcfa: 1800, claude_test_fcfa: 200, ai_conversations: 100 }));
    expect(b.revenue).toBe(10_000);
    expect(b.paymentFees).toBe(300);
    expect(b.margin).toBeCloseTo(0.77, 6);
    expect(b.flagged).toBe(false);
    expect(b.claudePerConversation).toBe(18); // replies only, not test chat
    expect(b.budget).toBe(3_700);
  });

  it("flags a paid business below 60%, and one that costs money without paying", () => {
    expect(businessMargin(row({ claude_reply_fcfa: 4_000 })).flagged).toBe(true); // 57%
    expect(businessMargin(row({ claude_reply_fcfa: 4_000 })).overBudget).toBe(true);
    const trial = businessMargin(row({ subscription_status: "trialing", claude_reply_fcfa: 50 }));
    expect(trial.revenue).toBe(0);
    expect(trial.margin).toBeNull();
    expect(trial.flagged).toBe(true);
  });

  it("treats Free as acquisition cost, never as a margin", () => {
    const free = businessMargin(row({ plan_id: "free", claude_reply_fcfa: 120 }));
    expect(free).toMatchObject({ revenue: 0, margin: null, flagged: false, budget: 300, overBudget: false });
    const plans = planMargins([free, businessMargin(row({ business_id: "b2", claude_reply_fcfa: 1_000 }))]);
    expect(plans.find((p) => p.planId === "free")).toMatchObject({ businesses: 1, paying: 0, claude: 120, margin: null });
    expect(plans.find((p) => p.planId === "starter")?.margin).toBeCloseTo(0.87, 6);
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
      { id: "free", monthly_price: 0, ai_conversations_per_month: 50 },
      { id: "starter", monthly_price: 12_000, ai_conversations_per_month: 500 },
      { id: "business", monthly_price: 25_000, ai_conversations_per_month: 2_000 },
    ];
    expect(planConfigDrift(db)).toEqual(["starter", "pro"]);
  });
});
