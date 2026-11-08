import { ADDONS, AI_TOPUP, BUNDLE_PRICES, LOCAL_PLAN_PRICES, PLANS, PLANS_ON_SALE, periodPrice, planCurrencyFor, type AddonId, type BillingInterval, type PlanId } from "@/config/economics";

/*
 * What a business pays: a plan, optionally with the AI add-on, monthly or
 * annual (10 months for 12). A bundle (config/economics.ts BUNDLE_PRICES)
 * replaces the sum of a plan and an add-on with a set price; there is no
 * special case in code. Pure: the prices come from config/economics.ts.
 */

export type Catalog = {
  plans: { id: PlanId; monthlyPrice: number }[];
  addons: { id: AddonId; monthlyPrice: number; conversationsPerMonth: number }[];
  bundles: { planId: PlanId; addonId: AddonId; monthlyPrice: number }[];
};

export { planCurrencyFor };

export const catalog: Catalog = { plans: PLANS, addons: ADDONS, bundles: BUNDLE_PRICES };

/**
 * What a business can buy in its own currency: everything in FCFA; in another
 * currency (LOCAL_PLAN_PRICES) the plans on sale only. null: nothing is priced
 * in that currency yet (the team agrees the price with the business).
 */
export function catalogFor(currency: string): Catalog | null {
  // A business pays its plan in its plan currency (US dollars outside Cameroon).
  const planCurrency = planCurrencyFor(currency);
  if (planCurrency === "XAF") return catalog;
  const local = LOCAL_PLAN_PRICES[planCurrency];
  if (!local) return null;
  return {
    plans: PLANS.filter((p) => (PLANS_ON_SALE as readonly string[]).includes(p.id) && local[p.id] !== undefined).map((p) => ({ id: p.id, monthlyPrice: local[p.id]! })),
    addons: [],
    bundles: [],
  };
}

export type Quote = {
  planId: PlanId;
  addonId: AddonId | null;
  interval: BillingInterval;
  /** Plan + add-on per month before any bundle price. */
  listMonthly: number;
  /** What the business pays per month (the bundle price when there is one). */
  monthly: number;
  /** What it pays for the billing period (annual: ANNUAL_MONTHS_PAID months). */
  period: number;
  /** What the bundle saves per month (0 without one). */
  bundleSaving: number;
  /** The add-on's share of the monthly price (what the AI earns us, for its Claude budget). */
  aiMonthly: number;
  /** AI conversations included per month. */
  aiConversations: number;
};

export function quote(planId: PlanId, addonId: AddonId | null, interval: BillingInterval = "month", cat: Catalog = catalog): Quote {
  const plan = cat.plans.find((p) => p.id === planId);
  if (!plan) throw new Error(`unknown plan ${planId}`);
  const addon = addonId ? cat.addons.find((a) => a.id === addonId) : null;
  if (addonId && !addon) throw new Error(`unknown add-on ${addonId}`);
  const listMonthly = plan.monthlyPrice + (addon?.monthlyPrice ?? 0);
  const bundle = addon ? cat.bundles.find((b) => b.planId === planId && b.addonId === addon.id) : undefined;
  const monthly = bundle ? bundle.monthlyPrice : listMonthly;
  return {
    planId,
    addonId: addon?.id ?? null,
    interval,
    listMonthly,
    monthly,
    period: periodPrice(monthly, interval),
    bundleSaving: listMonthly - monthly,
    aiMonthly: addon ? monthly - plan.monthlyPrice : 0,
    aiConversations: addon?.conversationsPerMonth ?? 0,
  };
}

/** What the WazaBolt team should collect for a request: the period price, plus the setup fee when it's still owed. */
export function amountDue(q: Pick<Quote, "period">, setupFee: { amount: number; paid: boolean } = { amount: 0, paid: true }): number {
  return q.period + (setupFee.paid ? 0 : setupFee.amount);
}

export const topupPrice = () => AI_TOPUP.price;

/** The plans on sale, cheapest first. */
export const plansOnSale = () => PLANS_ON_SALE.map((id) => PLANS.find((p) => p.id === id)!).sort((a, b) => a.monthlyPrice - b.monthlyPrice);

export function isPlanOnSale(id: string): id is (typeof PLANS_ON_SALE)[number] {
  return (PLANS_ON_SALE as readonly string[]).includes(id);
}
export function isAddonId(id: string): id is AddonId {
  return ADDONS.some((a) => a.id === id);
}
