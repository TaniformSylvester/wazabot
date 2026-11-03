import type { AddonId, PlanId } from "@/config/economics";

/*
 * What a business may use — the one place the app asks. The facts come from
 * business_features() (lib/billing/plan-access.ts loads them); the same plan
 * rows drive the database triggers that enforce user and shop limits, so the
 * app and the database agree.
 *
 *   canUse(access, "reports")      a feature of the plan (or the AI assistant)
 *   getLimit(access, "members")    { max, used, reached } for a counted limit
 *
 * Over a limit or without a feature, the app shows an upgrade prompt
 * (components/app/plan-upsell.tsx, or the error alert's "See plans" link).
 */

export type Access = "full" | "read_only" | "billing_only";

export type PlanAccess = {
  planId: PlanId | "starter" | "pro";
  planName: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  access: Access;
  interval: "month" | "year";
  periodStart: string;
  periodEnd: string;
  trialStartedAt: string | null;
  features: { profit: boolean; reports: boolean; stockHistory: boolean; paymentNotes: boolean };
  members: { max: number | null; used: number };
  shops: { max: number; used: number };
  addonId: AddonId | null;
  aiLaunched: boolean;
  aiTrial: { startedAt: string | null; endsAt: string | null };
  metaNoticeAcceptedAt: string | null;
  setupFee: { amount: number; paidAt: string | null };
};

export type Feature =
  /** Recording anything: false once a trial or paid period has ended unpaid (read-only). */
  | "write"
  | "expenses"
  | "profit"
  | "reports"
  | "stock_history"
  | "payment_notes"
  /** The WhatsApp AI assistant answers customers (launched, and the add-on or the AI trial). */
  | "ai_assistant"
  /** Buying the AI add-on or starting the AI trial (launched only: "coming soon" before). */
  | "buy_ai";

export type Limit = "members" | "shops";

const DAY = 86_400_000;

/** Is the AI trial running at `now`? (The 50-conversation cap is counted by ai_usage_status.) */
export function aiTrialActive(a: Pick<PlanAccess, "aiTrial" | "addonId">, now = new Date()): boolean {
  return !a.addonId && !!a.aiTrial.startedAt && !!a.aiTrial.endsAt && now.getTime() < new Date(a.aiTrial.endsAt).getTime();
}

export function canUse(a: PlanAccess, feature: Feature, now = new Date()): boolean {
  const full = a.access === "full";
  // No plan (read-only): everything recorded can still be seen and exported; nothing new is recorded.
  const view = (included: boolean) => (a.access === "read_only" ? true : full && included);
  switch (feature) {
    case "write":
      return full;
    case "expenses":
    case "profit":
      return view(a.features.profit);
    case "reports":
      return view(a.features.reports);
    case "stock_history":
      return view(a.features.stockHistory);
    case "payment_notes":
      return full && a.features.paymentNotes;
    case "ai_assistant":
      return full && a.aiLaunched && (!!a.addonId || aiTrialActive(a, now));
    case "buy_ai":
      return a.aiLaunched && a.access !== "billing_only";
  }
}

export function getLimit(a: PlanAccess, limit: Limit): { max: number | null; used: number; reached: boolean } {
  const { max, used } = limit === "members" ? a.members : a.shops;
  return { max, used, reached: max !== null && used >= max };
}

/** Days left in a trial (rounded up), or null when not on a trial. */
export function trialDaysLeft(a: Pick<PlanAccess, "status" | "periodEnd">, now = new Date()): number | null {
  if (a.status !== "trialing") return null;
  return Math.max(0, Math.ceil((new Date(a.periodEnd).getTime() - now.getTime()) / DAY));
}

/** The plan ids the database may still hold for old subscriptions, mapped to what replaced them. */
export function currentPlanId(id: string): PlanId {
  if (id === "starter") return "business";
  if (id === "pro") return "multishop";
  return id === "boutique" || id === "business" || id === "multishop" ? id : "free";
}
