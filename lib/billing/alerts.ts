import "server-only";

import { siteConfig } from "@/config/site";
import { emailLayout, esc, sendEmail } from "@/lib/email/send";
import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * Alerts to the WazaBolt team (email to the team inbox). platform_alerts
 * remembers each one, so an alert about the same thing is sent once.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type AlertKind = "spend_jump" | "budget_80" | "budget_reached" | "renewal_reminder" | "payment_due" | "downgraded";

/** Claims the alert; true if it hadn't been sent before (the caller then sends it). */
export async function claimAlert(admin: Admin, kind: AlertKind, businessId: string | null, periodKey: string): Promise<boolean> {
  const { data, error } = await admin.from("platform_alerts").upsert({ kind, business_id: businessId, period_key: periodKey }, { onConflict: "kind,business_id,period_key", ignoreDuplicates: true }).select("id");
  if (error) {
    logServerError("billing.alert", error);
    return false;
  }
  return Boolean(data?.length);
}

const fcfa = (v: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v)} FCFA`;
const adminLink = (path: string) => `${siteConfig.url.replace(/\/$/, "")}/en/admin/${path}`;

/** A business has used a share of its hidden Claude budget this usage month. */
export async function sendBudgetAlert(admin: Admin, a: { businessId: string; businessName: string; planId: string; spent: number; budget: number; periodStart: string; reached: boolean }) {
  const kind = a.reached ? "budget_reached" : "budget_80";
  if (!(await claimAlert(admin, kind, a.businessId, a.periodStart.slice(0, 10)))) return;
  const share = Math.round((a.spent / a.budget) * 100);
  const title = a.reached ? `${a.businessName} used its whole Claude budget` : `${a.businessName} passed ${share}% of its Claude budget`;
  await sendEmail({
    to: siteConfig.email.teamInbox,
    subject: `[WazaBolt] ${title}`,
    html: emailLayout({
      title,
      intro: a.reached
        ? "The assistant now answers with rules only for this business; other messages go to its team until the next usage month."
        : "Replies are already shorter for this business. Check the margin report; consider the kill switch if something looks wrong.",
      rows: [
        ["Business", esc(a.businessName)],
        ["Plan", esc(a.planId)],
        ["Claude this month", `${fcfa(a.spent)} of ${fcfa(a.budget)}`],
      ],
      button: { label: "Open margins", href: adminLink("margins") },
      footer: "You receive this because you are on the WazaBolt team.",
    }),
    text: `${title}\n\nPlan: ${a.planId}\nClaude this month: ${fcfa(a.spent)} of ${fcfa(a.budget)}\n\n${adminLink("margins")}`,
  });
}

/** Yesterday's Claude spend jumped compared with the day before (all businesses). */
export async function sendSpendJumpAlert(admin: Admin, a: { day: string; spent: number; before: number; top: { name: string; spent: number }[] }) {
  if (!(await claimAlert(admin, "spend_jump", null, a.day))) return;
  const jump = a.before > 0 ? Math.round((a.spent / a.before - 1) * 100) : null;
  const title = `Claude spend up ${jump === null ? "" : `${jump}% `}on ${a.day}`;
  await sendEmail({
    to: siteConfig.email.teamInbox,
    subject: `[WazaBolt] ${title}`,
    html: emailLayout({
      title,
      intro: `${fcfa(a.spent)} on ${esc(a.day)}, against ${fcfa(a.before)} the day before.`,
      rows: a.top.map((t) => [esc(t.name), fcfa(t.spent)]),
      button: { label: "Open margins", href: adminLink("margins") },
      footer: "You receive this because you are on the WazaBolt team.",
    }),
    text: `${title}\n\n${fcfa(a.spent)} vs ${fcfa(a.before)}\n${a.top.map((t) => `${t.name}: ${fcfa(t.spent)}`).join("\n")}\n\n${adminLink("margins")}`,
  });
}
