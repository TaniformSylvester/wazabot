import { PLANS, type PlanId } from "@/config/economics";

/**
 * Subscription plans shown on the marketing site — the public part of
 * config/economics.ts (prices and allowances; never costs or budgets).
 * Plan names and descriptions are translated in the dictionaries
 * (pricing.plans.<id>); prices are formatted per locale with formatXaf().
 */
export type Plan = {
  id: PlanId;
  /** Monthly price in the smallest unit of `currency` (XAF has no minor unit). */
  monthlyPrice: number;
  currency: "XAF";
  /** Metered AI conversations included per month. Never "unlimited". */
  aiConversationsPerMonth: number;
  highlighted?: boolean;
  maxProducts: number | null;
  maxMonthlySales: number | null;
  maxMembers: number;
  reportDays: number | null;
  hasProfit: boolean;
};

export const plans: Plan[] = PLANS.map((p) => ({
  id: p.id,
  monthlyPrice: p.monthlyPrice,
  currency: "XAF",
  aiConversationsPerMonth: p.aiConversationsPerMonth,
  maxProducts: p.maxProducts,
  maxMonthlySales: p.maxMonthlySales,
  maxMembers: p.maxMembers,
  reportDays: p.reportDays,
  hasProfit: p.hasProfit,
  ...(p.highlighted ? { highlighted: true } : {}),
}));
