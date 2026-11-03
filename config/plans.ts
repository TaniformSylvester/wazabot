import {
  ADDONS,
  AI_TOPUP,
  AI_TRIAL,
  ANNUAL_MONTHS_PAID,
  BUNDLE_PRICES,
  PLANS,
  PLANS_ON_SALE,
  TRIAL_DAYS,
  type AddonId,
  type PlanId,
} from "@/config/economics";

/**
 * What the marketing site and Billing show — the public part of
 * config/economics.ts (prices, allowances and features; never costs or
 * budgets). Names and descriptions are translated in the dictionaries
 * (pricing.plans.<id>, pricing.ai.addons.<id>); prices are formatted per
 * locale with formatXaf() ("7 500 FCFA" in French, "7,500 FCFA" in English).
 */
export type Plan = {
  id: PlanId;
  /** Monthly price in the smallest unit of `currency` (XAF has no minor unit). */
  monthlyPrice: number;
  currency: "XAF";
  highlighted?: boolean;
  maxMembers: number;
  hasProfit: boolean;
  hasReports: boolean;
  hasStockHistory: boolean;
  hasPaymentNotes: boolean;
  maxDocuments: number | null;
  maxStudents: number | null;
  hasBulkReportCards: boolean;
  hasSchoolReports: boolean;
  /** Shops included; extra shops at extraBranchPrice per month each (null: one shop only). */
  includedBranches: number;
  extraBranchPrice: number | null;
};

const toPlan = (p: (typeof PLANS)[number]): Plan => ({
  id: p.id,
  monthlyPrice: p.monthlyPrice,
  currency: "XAF",
  maxMembers: p.maxMembers,
  hasProfit: p.hasProfit,
  hasReports: p.hasReports,
  hasStockHistory: p.hasStockHistory,
  hasPaymentNotes: p.hasPaymentNotes,
  maxDocuments: p.maxDocuments,
  maxStudents: p.maxStudents,
  hasBulkReportCards: p.hasBulkReportCards,
  hasSchoolReports: p.hasSchoolReports,
  includedBranches: p.includedBranches,
  extraBranchPrice: p.extraBranchPrice,
  ...(p.highlighted ? { highlighted: true } : {}),
});

/** The plans on sale, cheapest first. */
export const plans: Plan[] = PLANS_ON_SALE.map((id) => toPlan(PLANS.find((p) => p.id === id)!)).sort((a, b) => a.monthlyPrice - b.monthlyPrice);

export type Addon = { id: AddonId; monthlyPrice: number; conversationsPerMonth: number };
export const addons: Addon[] = ADDONS.map((a) => ({ ...a }));
export const bundles = BUNDLE_PRICES.map((b) => ({ ...b }));
export const aiTopup = { ...AI_TOPUP };
export const aiTrial = { ...AI_TRIAL };
export const trialDays = TRIAL_DAYS;
export const annualMonthsPaid = ANNUAL_MONTHS_PAID;

/** The cheapest plan that includes something (for "included from the … plan"). */
export function cheapestPlanWith(has: (p: Plan) => boolean): Plan | undefined {
  return [...plans].sort((a, b) => a.monthlyPrice - b.monthlyPrice).find(has);
}
