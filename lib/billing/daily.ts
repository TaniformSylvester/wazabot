import "server-only";

import { ALERTS, PAYMENT_GRACE_DAYS, RENEWAL_REMINDER_DAYS, claudeBudgetFcfa, periodPrice, type PlanId } from "@/config/economics";
import { siteConfig } from "@/config/site";
import { emailLayout, esc, sendEmail } from "@/lib/email/send";
import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

import { claimAlert, sendBudgetAlert, sendSpendJumpAlert } from "./alerts";
import { getUsageStatus } from "./usage";

/*
 * Once a day (Vercel Cron → /api/cron/billing):
 *   1. prepaid periods: payment due at the end, Free after PAYMENT_GRACE_DAYS
 *      (apply_billing_expiry); the owner is emailed each time
 *   2. renewal reminders RENEWAL_REMINDER_DAYS before a paid period ends
 *   3. businesses past ALERTS.budgetShare of their hidden Claude budget
 *      (catches spend from the test chat too) → the WazaBolt team
 *   4. yesterday's Claude spend up more than ALERTS.dailySpendJump → the team
 * Every email is sent once (platform_alerts).
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type Lang = "en" | "fr";
const DAY = 86_400_000;

const money = (n: number, lang: Lang) => `${new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(n).replace(/ | /g, " ")} FCFA`;
const date = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Douala" }).format(new Date(iso));
const site = () => siteConfig.url.replace(/\/$/, "");

const OWNER = {
  renewal: {
    en: (plan: string, end: string, price: string) => ({
      subject: `Your WazaBolt ${plan} plan ends on ${end}`,
      title: `Your ${plan} plan ends on ${end}`,
      intro: `To keep your assistant at full strength, renew it before then: <b>${esc(price)}</b> by Mobile Money. Request the renewal on your Billing page and our team will contact you.`,
      button: "Renew my plan",
    }),
    fr: (plan: string, end: string, price: string) => ({
      subject: `Votre forfait WazaBolt ${plan} se termine le ${end}`,
      title: `Votre forfait ${plan} se termine le ${end}`,
      intro: `Pour garder votre assistant au complet, renouvelez-le avant cette date : <b>${esc(price)}</b> par Mobile Money. Demandez le renouvellement depuis votre page Facturation et notre équipe vous contactera.`,
      button: "Renouveler mon forfait",
    }),
  },
  payment_due: {
    en: (plan: string, end: string, grace: string) => ({
      subject: `Your WazaBolt ${plan} plan has ended: renew by ${grace}`,
      title: `Your ${plan} plan ended on ${end}`,
      intro: `It keeps working until <b>${esc(grace)}</b>. Renew it before then on your Billing page; after that your business moves to the Free plan (nothing is deleted).`,
      button: "Renew now",
    }),
    fr: (plan: string, end: string, grace: string) => ({
      subject: `Votre forfait WazaBolt ${plan} est terminé : renouvelez avant le ${grace}`,
      title: `Votre forfait ${plan} s'est terminé le ${end}`,
      intro: `Il continue de fonctionner jusqu'au <b>${esc(grace)}</b>. Renouvelez-le d'ici là depuis votre page Facturation ; ensuite votre entreprise passe au forfait Gratuit (rien n'est supprimé).`,
      button: "Renouveler maintenant",
    }),
  },
  downgraded: {
    en: (plan: string) => ({
      subject: "Your business is now on the WazaBolt Free plan",
      title: "You're now on the Free plan",
      intro: `Your ${esc(plan)} plan wasn't renewed, so your business moved to the Free plan. Everything is still there; renew any time on your Billing page to get your plan back.`,
      button: "See plans",
    }),
    fr: (plan: string) => ({
      subject: "Votre entreprise est passée au forfait WazaBolt Gratuit",
      title: "Vous êtes maintenant au forfait Gratuit",
      intro: `Votre forfait ${esc(plan)} n'a pas été renouvelé : votre entreprise est passée au forfait Gratuit. Tout est conservé ; renouvelez quand vous voulez depuis votre page Facturation.`,
      button: "Voir les forfaits",
    }),
  },
};
const FOOTER = {
  en: "WazaBolt · www.wazabolt.com · Questions? Just reply to this email.",
  fr: "WazaBolt · www.wazabolt.com · Une question ? Répondez simplement à cet e-mail.",
};

async function ownerOf(admin: Admin, businessId: string) {
  const { data: m } = await admin.from("business_members").select("user_id").eq("business_id", businessId).eq("role", "owner").maybeSingle();
  if (!m) return null;
  const [{ data: u }, { data: b }] = await Promise.all([
    admin.from("users").select("email, ui_locale").eq("id", m.user_id).maybeSingle(),
    admin.from("businesses").select("name").eq("id", businessId).maybeSingle(),
  ]);
  return u?.email ? { email: u.email, lang: (u.ui_locale === "fr" ? "fr" : "en") as Lang, business: b?.name ?? "" } : null;
}

async function emailOwner(admin: Admin, businessId: string, make: (lang: Lang) => { subject: string; title: string; intro: string; button: string }) {
  const owner = await ownerOf(admin, businessId);
  if (!owner) return;
  const t = make(owner.lang);
  const href = `${site()}/${owner.lang}/dashboard/billing`;
  await sendEmail({
    to: owner.email,
    subject: t.subject,
    html: emailLayout({ title: t.title, intro: t.intro, button: { label: t.button, href }, footer: FOOTER[owner.lang] }),
    text: `${t.title}\n\n${t.intro.replace(/<[^>]+>/g, "")}\n\n${href}`,
  });
}

export type DailyTally = { paymentDue: number; downgraded: number; reminders: number; budgetAlerts: number; spendJump: boolean };

export async function runDailyBilling(admin: Admin, now = new Date()): Promise<DailyTally> {
  const tally: DailyTally = { paymentDue: 0, downgraded: 0, reminders: 0, budgetAlerts: 0, spendJump: false };
  const plans = new Map(((await admin.from("plans").select("id, name, monthly_price")).data ?? []).map((p) => [p.id, p]));
  const planName = (id: string) => plans.get(id)?.name ?? id;

  // 1. Expired prepaid periods.
  const { data: changes, error } = await admin.rpc("apply_billing_expiry", { p_grace_days: PAYMENT_GRACE_DAYS });
  if (error) logServerError("billing.expiry", error);
  for (const c of changes ?? []) {
    const kind = c.action === "downgraded" ? "downgraded" : "payment_due";
    if (!(await claimAlert(admin, kind, c.business_id, c.period_end.slice(0, 10)))) continue;
    const grace = new Date(new Date(c.period_end).getTime() + PAYMENT_GRACE_DAYS * DAY).toISOString();
    await emailOwner(admin, c.business_id, (lang) => (kind === "downgraded" ? OWNER.downgraded[lang](planName(c.plan_id)) : OWNER.payment_due[lang](planName(c.plan_id), date(c.period_end, lang), date(grace, lang))));
    if (kind === "downgraded") tally.downgraded++;
    else tally.paymentDue++;
  }

  // 2. Renewal reminders.
  const { data: ending } = await admin
    .from("subscriptions")
    .select("business_id, plan_id, billing_interval, current_period_end")
    .eq("status", "active")
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", new Date(now.getTime() + RENEWAL_REMINDER_DAYS[0] * DAY).toISOString());
  for (const s of ending ?? []) {
    const plan = plans.get(s.plan_id);
    if (!plan || Number(plan.monthly_price) <= 0) continue;
    const daysLeft = Math.ceil((new Date(s.current_period_end).getTime() - now.getTime()) / DAY);
    // The reminder for the nearest step not yet passed (5 days, then 1 day).
    const step = [...RENEWAL_REMINDER_DAYS].sort((a, b) => a - b).find((d) => daysLeft <= d);
    if (step === undefined || !(await claimAlert(admin, "renewal_reminder", s.business_id, `${s.current_period_end.slice(0, 10)}:${step}`))) continue;
    const price = periodPrice(Number(plan.monthly_price), s.billing_interval === "year" ? "year" : "month");
    await emailOwner(admin, s.business_id, (lang) => OWNER.renewal[lang](plan.name, date(s.current_period_end, lang), money(price, lang)));
    tally.reminders++;
  }

  // 3. Hidden budgets past the alert share (businesses with Claude spend in the last 31 days).
  const { data: recent } = await admin.from("claude_calls").select("business_id").gte("created_at", new Date(now.getTime() - 31 * DAY).toISOString()).limit(5000);
  for (const businessId of new Set((recent ?? []).map((r) => r.business_id))) {
    const status = await getUsageStatus(admin, businessId, now);
    if (!status) continue;
    const budget = claudeBudgetFcfa({ id: status.planId as PlanId, monthlyPrice: status.monthlyPrice }, status.interval);
    const { data: spent } = await admin.rpc("claude_spend_since", { p_business_id: businessId, p_since: status.periodStart });
    const total = Number(spent ?? 0);
    if (!budget || total < budget * ALERTS.budgetShare) continue;
    const { data: b } = await admin.from("businesses").select("name").eq("id", businessId).maybeSingle();
    await sendBudgetAlert(admin, { businessId, businessName: b?.name ?? businessId, planId: status.planId, spent: total, budget, periodStart: status.periodStart, reached: total >= budget });
    tally.budgetAlerts++;
  }

  // 4. Yesterday's Claude spend against the day before (UTC days).
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const { data: calls } = await admin
    .from("claude_calls")
    .select("business_id, cost_fcfa, created_at")
    .gte("created_at", new Date(today - 2 * DAY).toISOString())
    .lt("created_at", new Date(today).toISOString())
    .limit(100_000);
  const yesterday = (calls ?? []).filter((c) => new Date(c.created_at).getTime() >= today - DAY);
  const spent = yesterday.reduce((n, c) => n + Number(c.cost_fcfa), 0);
  const before = (calls ?? []).filter((c) => new Date(c.created_at).getTime() < today - DAY).reduce((n, c) => n + Number(c.cost_fcfa), 0);
  if (spent >= ALERTS.dailySpendMinFcfa && spent > before * (1 + ALERTS.dailySpendJump)) {
    const byBusiness = new Map<string, number>();
    for (const c of yesterday) byBusiness.set(c.business_id, (byBusiness.get(c.business_id) ?? 0) + Number(c.cost_fcfa));
    const topIds = [...byBusiness.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const { data: names } = await admin.from("businesses").select("id, name").in("id", topIds.map(([id]) => id));
    await sendSpendJumpAlert(admin, {
      day: new Date(today - DAY).toISOString().slice(0, 10),
      spent,
      before,
      top: topIds.map(([id, v]) => ({ name: names?.find((n) => n.id === id)?.name ?? id, spent: v })),
    });
    tally.spendJump = true;
  }
  return tally;
}
