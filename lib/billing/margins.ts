import "server-only";

import { FCFA_PER_USD, MARGIN_TARGET, META_PRICING, MOBILE_MONEY_FEE_RATE, PLANS, claudeBudgetFcfa } from "@/config/economics";
import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * The WazaBolt team's margin report (admin only). Costs come from the
 * database (admin_cost_report); revenue, fees, budgets and the target come
 * from config/economics.ts.
 *
 *   revenue   the plan's monthly price for an active (or past-due) subscription
 *             — there is no payment history yet, so this is what is billed
 *   margin    (revenue − Claude cost − Mobile Money fee) ÷ revenue
 *   Free      no revenue: its Claude cost is acquisition cost
 *   Meta      paid by each business directly; an estimate only, not our cost
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type CostRow = {
  business_id: string;
  business_name: string;
  plan_id: string | null;
  subscription_status: string | null;
  claude_reply_fcfa: number;
  claude_test_fcfa: number;
  claude_usd: number;
  claude_requests: number;
  ai_conversations: number;
  service_sent: number;
  service_over_free: number;
  utility_sent: number;
  marketing_sent: number;
};

export type BusinessMargin = {
  businessId: string;
  name: string;
  planId: string;
  status: string | null;
  revenue: number;
  paymentFees: number;
  claude: number;
  claudeTest: number;
  claudeRequests: number;
  budget: number;
  aiConversations: number;
  /** Claude cost of customer replies per AI conversation. */
  claudePerConversation: number | null;
  /** null when there is no revenue (Free, trial, cancelled). */
  margin: number | null;
  /** Paid plan below the target, or costing us money without paying. */
  flagged: boolean;
  overBudget: boolean;
  whatsapp: { service: number; serviceOverFree: number; utility: number; marketing: number };
  /** What Meta would bill the business (FCFA): service over the free allowance, utility and marketing. */
  metaEstimate: number;
};

export type PlanMargin = {
  planId: string;
  businesses: number;
  paying: number;
  revenue: number;
  paymentFees: number;
  claude: number;
  margin: number | null;
  flagged: boolean;
  aiConversations: number;
  metaEstimate: number;
};

const PAID_STATUSES = new Set(["active", "past_due"]);
const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

export function metaEstimateFcfa(w: BusinessMargin["whatsapp"]) {
  const r = META_PRICING.ratesUsd;
  return (w.serviceOverFree * r.service + w.utility * r.utility + w.marketing * r.marketing) * FCFA_PER_USD;
}

export function businessMargin(row: CostRow): BusinessMargin {
  const planId = row.plan_id ?? "free";
  const plan = PLANS.find((p) => p.id === planId);
  const price = plan?.monthlyPrice ?? 0;
  const revenue = price > 0 && PAID_STATUSES.has(row.subscription_status ?? "") ? price : 0;
  const paymentFees = revenue * MOBILE_MONEY_FEE_RATE;
  const claude = Number(row.claude_reply_fcfa) + Number(row.claude_test_fcfa);
  const margin = revenue > 0 ? (revenue - claude - paymentFees) / revenue : null;
  const budget = claudeBudgetFcfa({ id: plan?.id ?? "free", monthlyPrice: price });
  const whatsapp = { service: row.service_sent, serviceOverFree: row.service_over_free, utility: row.utility_sent, marketing: row.marketing_sent };
  return {
    businessId: row.business_id,
    name: row.business_name,
    planId,
    status: row.subscription_status,
    revenue,
    paymentFees: round(paymentFees),
    claude: round(claude),
    claudeTest: round(Number(row.claude_test_fcfa)),
    claudeRequests: row.claude_requests,
    budget,
    aiConversations: row.ai_conversations,
    claudePerConversation: row.ai_conversations ? round(Number(row.claude_reply_fcfa) / row.ai_conversations) : null,
    margin,
    flagged: margin !== null ? margin < MARGIN_TARGET : price > 0 && claude > 0,
    overBudget: claude > budget,
    whatsapp,
    metaEstimate: round(metaEstimateFcfa(whatsapp)),
  };
}

export function planMargins(businesses: BusinessMargin[]): PlanMargin[] {
  return PLANS.map((p) => {
    const rows = businesses.filter((b) => b.planId === p.id);
    const revenue = rows.reduce((s, b) => s + b.revenue, 0);
    const paymentFees = rows.reduce((s, b) => s + b.paymentFees, 0);
    const claude = rows.reduce((s, b) => s + b.claude, 0);
    const margin = revenue > 0 ? (revenue - claude - paymentFees) / revenue : null;
    return {
      planId: p.id,
      businesses: rows.length,
      paying: rows.filter((b) => b.revenue > 0).length,
      revenue,
      paymentFees: round(paymentFees),
      claude: round(claude),
      margin,
      flagged: margin !== null && margin < MARGIN_TARGET,
      aiConversations: rows.reduce((s, b) => s + b.aiConversations, 0),
      metaEstimate: round(rows.reduce((s, b) => s + b.metaEstimate, 0)),
    };
  });
}

/** "2026-10" → first day of that month; anything else → the current month (UTC). */
export function reportMonth(param: string | undefined, now: Date): string {
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return `${param}-01`;
  return `${now.toISOString().slice(0, 7)}-01`;
}

/** Plans whose price or allowance in the database differs from config/economics.ts. */
export function planConfigDrift(dbPlans: { id: string; monthly_price: number; ai_conversations_per_month: number }[]) {
  return PLANS.filter((p) => {
    const db = dbPlans.find((d) => d.id === p.id);
    return !db || Number(db.monthly_price) !== p.monthlyPrice || db.ai_conversations_per_month !== p.aiConversationsPerMonth;
  }).map((p) => p.id);
}

export async function getMarginReport(admin: Admin, month: string) {
  const [{ data, error }, { data: dbPlans }] = await Promise.all([
    admin.rpc("admin_cost_report", { p_month: month, p_free_service: META_PRICING.freeServicePerNumberPerMonth }),
    admin.from("plans").select("id, monthly_price, ai_conversations_per_month"),
  ]);
  if (error) throw error;
  const businesses = (data ?? []).map((r) => businessMargin(r as CostRow));
  return { month, businesses, plans: planMargins(businesses), drift: planConfigDrift(dbPlans ?? []) };
}
