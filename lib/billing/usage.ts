import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/** Share of the monthly allowance at which owners and admins are warned. */
export const USAGE_WARNING_RATIO = 0.8;

export type UsageStatus = {
  planId: string;
  planName: string;
  /** AI conversations included per month. */
  limit: number;
  /** Conversations the assistant has answered in since the start of the month (UTC). */
  used: number;
  periodStart: string;
  level: "ok" | "warning" | "reached";
};

export function usageLevel(used: number, limit: number): UsageStatus["level"] {
  if (used >= limit) return "reached";
  if (used >= limit * USAGE_WARNING_RATIO) return "warning";
  return "ok";
}

/**
 * The plan's allowance and this month's use, from ai_usage_status() — the
 * same definition the AI pipeline enforces. Works with the user's client
 * (members only) or the service-role client.
 */
export async function getUsageStatus(db: SupabaseClient<Database>, businessId: string): Promise<UsageStatus | null> {
  const { data, error } = await db.rpc("ai_usage_status", { p_business_id: businessId }).maybeSingle();
  if (error || !data) return null;
  return {
    planId: data.plan_id,
    planName: data.plan_name,
    limit: data.conversation_limit,
    used: data.conversations_used,
    periodStart: data.period_start,
    level: usageLevel(data.conversations_used, data.conversation_limit),
  };
}
