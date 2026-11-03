import { describe, expect, it } from "vitest";

import { ADDONS, AI_TOPUP, BUNDLE_PRICES, PLANS, PLANS_ON_SALE, SETUP_FEE_RANGE, TRIAL_DAYS } from "@/config/economics";
import { addons, bundles, plans } from "@/config/plans";
import { aiTrialActive, canUse, currentPlanId, getLimit, trialDaysLeft, type PlanAccess } from "@/lib/billing/entitlements";
import { amountDue, quote, type Catalog } from "@/lib/billing/price";
import { formatXaf } from "@/lib/i18n/format";

const plan = (id: string) => PLANS.find((p) => p.id === id)!;

/** A business's plan access as business_features() returns it, for the plan given. */
function access(planId: "boutique" | "business" | "multishop" | "free", over: Partial<PlanAccess> = {}): PlanAccess {
  const p = plan(planId);
  return {
    planId,
    planName: planId,
    status: "active",
    access: planId === "free" ? "read_only" : "full",
    interval: "month",
    periodStart: "2026-11-01T00:00:00Z",
    periodEnd: "2026-12-01T00:00:00Z",
    trialStartedAt: null,
    features: { profit: p.hasProfit, reports: p.hasReports, stockHistory: p.hasStockHistory, paymentNotes: p.hasPaymentNotes },
    members: { max: p.maxMembers, used: 1 },
    shops: { max: p.includedBranches, used: 1 },
    addonId: null,
    aiLaunched: false,
    aiTrial: { startedAt: null, endsAt: null },
    metaNoticeAcceptedAt: null,
    setupFee: { amount: 0, paidAt: null },
    ...over,
  };
}

describe("plans and prices (config/economics.ts)", () => {
  it("three plans on sale at the agreed prices, no AI included", () => {
    expect(PLANS_ON_SALE).toEqual(["boutique", "business", "multishop"]);
    expect(plans.map((p) => [p.id, p.monthlyPrice])).toEqual([
      ["boutique", 3_000],
      ["business", 7_500],
      ["multishop", 15_000],
    ]);
    expect(PLANS.every((p) => p.aiConversationsPerMonth === 0)).toBe(true);
  });

  it("users and shops: Boutique 1 and 1, Business 3 and 1, Multi-shop more of both", () => {
    expect([plan("boutique").maxMembers, plan("boutique").includedBranches]).toEqual([1, 1]);
    expect([plan("business").maxMembers, plan("business").includedBranches]).toEqual([3, 1]);
    expect(plan("multishop").maxMembers).toBeGreaterThan(3);
    expect(plan("multishop").includedBranches).toBeGreaterThan(1);
  });

  it("features: Business adds expenses, estimated profit, reports, stock history and payment notes; Multi-shop has everything in Business", () => {
    const flags = (id: string) => [plan(id).hasProfit, plan(id).hasReports, plan(id).hasStockHistory, plan(id).hasPaymentNotes];
    expect(flags("boutique")).toEqual([false, false, false, false]);
    expect(flags("business")).toEqual([true, true, true, true]);
    expect(flags("multishop")).toEqual([true, true, true, true]);
  });

  it("the AI add-on, top-up and bundle", () => {
    expect(ADDONS).toEqual([
      { id: "ai_basic", monthlyPrice: 5_000, conversationsPerMonth: 300 },
      { id: "ai_plus", monthlyPrice: 12_000, conversationsPerMonth: 1_000 },
    ]);
    expect(AI_TOPUP).toEqual({ price: 2_000, conversations: 100 });
    expect(BUNDLE_PRICES).toEqual([{ planId: "business", addonId: "ai_basic", monthlyPrice: 11_500 }]);
    expect(TRIAL_DAYS).toBe(14);
    expect(SETUP_FEE_RANGE).toEqual({ min: 10_000, max: 25_000 });
  });

  it("the public lists carry the same prices (and no costs)", () => {
    expect(addons).toEqual(ADDONS);
    expect(bundles).toEqual(BUNDLE_PRICES);
    expect(Object.keys(plans[0]).some((k) => /budget|cost/i.test(k))).toBe(false);
  });

  it("prices read 7 500 FCFA in French and 7,500 FCFA in English", () => {
    // Spaces are non-breaking (the number and FCFA stay together on a narrow phone).
    const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
    expect(plain(formatXaf(7_500, "fr"))).toBe("7 500 FCFA");
    expect(plain(formatXaf(7_500, "en"))).toBe("7,500 FCFA");
    expect(plain(formatXaf(15_000, "fr"))).toBe("15 000 FCFA");
  });
});

describe("what a business pays (lib/billing/price.ts)", () => {
  it("a plan alone, monthly and annual (pay 10 months, get 12)", () => {
    expect(quote("business", null)).toMatchObject({ monthly: 7_500, period: 7_500, aiMonthly: 0, aiConversations: 0, bundleSaving: 0 });
    expect(quote("business", null, "year").period).toBe(75_000);
    expect(quote("boutique", null, "year").period).toBe(30_000);
    expect(quote("multishop", null, "year").period).toBe(150_000);
  });

  it("a plan with the AI add-on adds up, on any plan", () => {
    expect(quote("boutique", "ai_basic")).toMatchObject({ listMonthly: 8_000, monthly: 8_000, aiMonthly: 5_000, aiConversations: 300 });
    expect(quote("multishop", "ai_plus")).toMatchObject({ monthly: 27_000, aiMonthly: 12_000, aiConversations: 1_000 });
    expect(quote("business", "ai_plus").monthly).toBe(19_500);
  });

  it("the bundle: Business + AI Basic is 11,500 instead of 12,500", () => {
    const q = quote("business", "ai_basic");
    expect(q).toMatchObject({ listMonthly: 12_500, monthly: 11_500, bundleSaving: 1_000, aiMonthly: 4_000 });
    expect(quote("business", "ai_basic", "year").period).toBe(115_000);
  });

  it("bundles are data, not special cases: a new bundle in the catalog applies with no code change", () => {
    const cat: Catalog = {
      plans: [{ id: "boutique", monthlyPrice: 3_000 }],
      addons: [{ id: "ai_plus", monthlyPrice: 12_000, conversationsPerMonth: 1_000 }],
      bundles: [{ planId: "boutique", addonId: "ai_plus", monthlyPrice: 13_000 }],
    };
    expect(quote("boutique", "ai_plus", "month", cat)).toMatchObject({ monthly: 13_000, bundleSaving: 2_000, aiMonthly: 10_000 });
    expect(quote("boutique", null, "month", cat).monthly).toBe(3_000);
  });

  it("the setup fee is collected once, with the first payment", () => {
    const q = quote("business", null);
    expect(amountDue(q, { amount: 15_000, paid: false })).toBe(22_500);
    expect(amountDue(q, { amount: 15_000, paid: true })).toBe(7_500);
    expect(amountDue(q)).toBe(7_500);
  });

  it("unknown plans or add-ons are refused", () => {
    // @ts-expect-error — not a plan
    expect(() => quote("gold", null)).toThrow();
    // @ts-expect-error — not an add-on
    expect(() => quote("business", "ai_mega")).toThrow();
  });
});

describe("feature gating (lib/billing/entitlements.ts)", () => {
  it("Boutique: selling yes; expenses, profit, reports, stock history and payment notes no", () => {
    const a = access("boutique");
    expect(canUse(a, "write")).toBe(true);
    for (const f of ["expenses", "profit", "reports", "stock_history", "payment_notes"] as const) expect(canUse(a, f)).toBe(false);
  });

  it("Business and Multi-shop: all of them", () => {
    for (const id of ["business", "multishop"] as const) {
      const a = access(id);
      for (const f of ["write", "expenses", "profit", "reports", "stock_history", "payment_notes"] as const) expect(canUse(a, f)).toBe(true);
    }
  });

  it("a trial is the Business plan in full", () => {
    const a = access("business", { status: "trialing", trialStartedAt: "2026-11-01T00:00:00Z", periodEnd: "2026-11-15T00:00:00Z" });
    expect(canUse(a, "write")).toBe(true);
    expect(canUse(a, "reports")).toBe(true);
    expect(trialDaysLeft(a, new Date("2026-11-10T12:00:00Z"))).toBe(5);
    expect(trialDaysLeft(access("business"))).toBeNull();
  });

  it("no plan (trial or period ended): everything can be seen and exported, nothing recorded", () => {
    const a = access("free");
    expect(canUse(a, "write")).toBe(false);
    expect(canUse(a, "payment_notes")).toBe(false);
    for (const f of ["reports", "profit", "expenses", "stock_history"] as const) expect(canUse(a, f)).toBe(true);
  });

  it("an extra business waiting for its first plan: Billing only", () => {
    const a = access("free", { access: "billing_only" });
    for (const f of ["write", "reports", "profit", "stock_history", "buy_ai"] as const) expect(canUse(a, f)).toBe(false);
  });

  it("the AI assistant: never before launch, whatever the plan or add-on", () => {
    const a = access("business", { addonId: "ai_basic", aiLaunched: false });
    expect(canUse(a, "ai_assistant")).toBe(false);
    expect(canUse(a, "buy_ai")).toBe(false);
  });

  it("after launch: with the add-on, or during the AI trial; not without either", () => {
    const now = new Date("2026-12-10T00:00:00Z");
    expect(canUse(access("boutique", { aiLaunched: true, addonId: "ai_basic" }), "ai_assistant", now)).toBe(true);
    expect(canUse(access("boutique", { aiLaunched: true }), "ai_assistant", now)).toBe(false);
    expect(canUse(access("boutique", { aiLaunched: true }), "buy_ai", now)).toBe(true);
    const trial = { aiLaunched: true, aiTrial: { startedAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-15T00:00:00Z" } };
    expect(canUse(access("business", trial), "ai_assistant", now)).toBe(true);
    expect(canUse(access("business", trial), "ai_assistant", new Date("2026-12-16T00:00:00Z"))).toBe(false);
    expect(aiTrialActive({ addonId: null, aiTrial: trial.aiTrial }, now)).toBe(true);
    // A read-only business doesn't answer customers, even with an add-on left over.
    expect(canUse(access("free", { aiLaunched: true, addonId: "ai_basic" }), "ai_assistant", now)).toBe(false);
  });
});

describe("limits (lib/billing/entitlements.ts)", () => {
  it("users: Boutique's single user is the owner", () => {
    expect(getLimit(access("boutique"), "members")).toEqual({ max: 1, used: 1, reached: true });
    expect(getLimit(access("business", { members: { max: 3, used: 2 } }), "members")).toEqual({ max: 3, used: 2, reached: false });
    expect(getLimit(access("business", { members: { max: 3, used: 3 } }), "members").reached).toBe(true);
  });

  it("shops: Business has one; Multi-shop has room for more", () => {
    expect(getLimit(access("business"), "shops").reached).toBe(true);
    expect(getLimit(access("multishop", { shops: { max: 3, used: 2 } }), "shops")).toEqual({ max: 3, used: 2, reached: false });
  });

  it("old plan ids map to what replaced them", () => {
    expect(currentPlanId("starter")).toBe("business");
    expect(currentPlanId("pro")).toBe("multishop");
    expect(currentPlanId("boutique")).toBe("boutique");
    expect(currentPlanId("anything")).toBe("free");
  });
});
