import "server-only";

import { cache } from "react";

import type { AddonId } from "@/config/economics";
import { createClient } from "@/lib/supabase/server";

import { canUse, getLimit, type Feature, type Limit, type PlanAccess } from "./entitlements";

/** The current business's plan, access and features (once per request), from business_features(). */
export const getPlanAccess = cache(async (businessId: string): Promise<PlanAccess | null> => {
  const db = await createClient();
  const { data, error } = await db.rpc("business_features", { p_business_id: businessId }).maybeSingle();
  if (error || !data) return null;
  return toPlanAccess(data);
});

type Row = {
  plan_id: string;
  plan_name: string;
  status: string;
  access: string;
  billing_interval: string;
  current_period_start: string;
  current_period_end: string;
  trial_started_at: string | null;
  has_profit: boolean;
  has_reports: boolean;
  has_stock_history: boolean;
  has_payment_notes: boolean;
  max_members: number | null;
  members_used: number;
  branch_allowance: number;
  branches_used: number;
  addon_id: string | null;
  ai_launched: boolean;
  ai_trial_started_at: string | null;
  ai_trial_ends_at: string | null;
  meta_notice_accepted_at: string | null;
  setup_fee: number | string;
  setup_fee_paid_at: string | null;
};

export function toPlanAccess(r: Row): PlanAccess {
  return {
    planId: r.plan_id as PlanAccess["planId"],
    planName: r.plan_name,
    status: (["trialing", "active", "past_due", "canceled"].includes(r.status) ? r.status : "active") as PlanAccess["status"],
    access: r.access === "read_only" || r.access === "billing_only" ? r.access : "full",
    interval: r.billing_interval === "year" ? "year" : "month",
    periodStart: r.current_period_start,
    periodEnd: r.current_period_end,
    trialStartedAt: r.trial_started_at,
    features: { profit: r.has_profit, reports: r.has_reports, stockHistory: r.has_stock_history, paymentNotes: r.has_payment_notes },
    members: { max: r.max_members, used: r.members_used },
    shops: { max: r.branch_allowance, used: r.branches_used },
    addonId: r.addon_id === "ai_basic" || r.addon_id === "ai_plus" ? (r.addon_id as AddonId) : null,
    aiLaunched: r.ai_launched,
    aiTrial: { startedAt: r.ai_trial_started_at, endsAt: r.ai_trial_ends_at },
    metaNoticeAcceptedAt: r.meta_notice_accepted_at,
    setupFee: { amount: Number(r.setup_fee), paidAt: r.setup_fee_paid_at },
  };
}

/** For Server Actions and pages: may the current business use this feature? */
export async function businessCanUse(businessId: string, feature: Feature): Promise<boolean> {
  const a = await getPlanAccess(businessId);
  return !!a && canUse(a, feature);
}

export async function businessLimit(businessId: string, limit: Limit) {
  const a = await getPlanAccess(businessId);
  return a ? getLimit(a, limit) : null;
}

/** Is the WhatsApp AI assistant launched? Until then it's "coming soon" everywhere. */
export const aiAssistantLaunched = cache(async (): Promise<boolean> => {
  const db = await createClient();
  const { data } = await db.rpc("ai_assistant_launched");
  return data === true;
});
