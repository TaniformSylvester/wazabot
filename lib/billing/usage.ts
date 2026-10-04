import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PAYMENT_GRACE_DAYS, RENEWAL_REMINDER_DAYS, type BillingInterval } from "@/config/economics";
import type { Database } from "@/types/supabase";

/** Share of the monthly allowance at which owners and admins are warned. */
export const USAGE_WARNING_RATIO = 0.8;

export type UsageStatus = {
  planId: string;
  planName: string;
  monthlyPrice: number;
  /** AI conversations included per usage month. */
  limit: number;
  /** AI conversations so far this usage month. */
  used: number;
  periodStart: string;
  periodEnd: string;
  level: "ok" | "warning" | "reached";
  /**
   * legacy: conversations the assistant answered in this calendar month (before Step 4)
   * windows: one customer's 24-hour window in which Claude replied
   */
  counting: "legacy" | "windows";
  /** When the business moves (or moved) to 24-hour windows. */
  rulesFrom: string;
  interval: BillingInterval;
  subscriptionStatus: string;
  /** End of the paid period (paid plans). */
  currentPeriodEnd: string;
  billing: BillingState;
};

/**
 * Prepaid billing, as the owner sees it:
 *   free         nothing to pay
 *   active       paid up
 *   renew_soon   the period ends within RENEWAL_REMINDER_DAYS[0] days
 *   payment_due  the period ended; the plan continues until graceUntil, then Free
 */
export type BillingState = { state: "free" | "active" | "renew_soon" | "payment_due"; daysLeft: number | null; graceUntil: string | null };

export function usageLevel(used: number, limit: number): UsageStatus["level"] {
  if (used >= limit) return "reached";
  if (used >= limit * USAGE_WARNING_RATIO) return "warning";
  return "ok";
}

const DAY = 86_400_000;

export function billingState(monthlyPrice: number, status: string, currentPeriodEnd: string, now = new Date()): BillingState {
  if (monthlyPrice <= 0) return { state: "free", daysLeft: null, graceUntil: null };
  const end = new Date(currentPeriodEnd).getTime();
  if (status === "past_due" || end <= now.getTime()) {
    return { state: "payment_due", daysLeft: null, graceUntil: new Date(end + PAYMENT_GRACE_DAYS * DAY).toISOString() };
  }
  const daysLeft = Math.ceil((end - now.getTime()) / DAY);
  return { state: daysLeft <= RENEWAL_REMINDER_DAYS[0] ? "renew_soon" : "active", daysLeft, graceUntil: null };
}

/**
 * The plan's allowance and this usage month's use, from ai_usage_status() —
 * the same definition the AI pipeline enforces. Works with the user's client
 * (members only) or the service-role client.
 */
export async function getUsageStatus(db: SupabaseClient<Database>, businessId: string, now = new Date()): Promise<UsageStatus | null> {
  const { data, error } = await db.rpc("ai_usage_status", { p_business_id: businessId }).maybeSingle();
  if (error || !data) return null;
  const monthlyPrice = Number(data.monthly_price);
  return {
    planId: data.plan_id,
    planName: data.plan_name,
    monthlyPrice,
    limit: data.conversation_limit,
    used: data.conversations_used,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    level: usageLevel(data.conversations_used, data.conversation_limit),
    counting: data.counting === "legacy" ? "legacy" : "windows",
    rulesFrom: data.rules_from,
    interval: data.billing_interval === "year" ? "year" : "month",
    subscriptionStatus: data.subscription_status,
    currentPeriodEnd: data.current_period_end,
    billing: billingState(monthlyPrice, data.subscription_status, data.current_period_end, now),
  };
}
