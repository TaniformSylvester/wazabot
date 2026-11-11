import "server-only";

import { AI_TOPUP, PAYMENT_GRACE_DAYS, periodPrice, type BillingInterval } from "@/config/economics";
import { catalogFor, isAddonId, isPlanOnSale, planCurrencyFor, quote } from "@/lib/billing/price";
import { planNameFor } from "@/lib/billing/plan-names";
import { formatAmount } from "@/lib/i18n/format";
import { siteConfig } from "@/config/site";
import type { PaymentRecord } from "@/lib/billing/payments";
import { emailLayout, esc, sendEmail } from "@/lib/email/send";
import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * Plan requests for the WazaBolt team: owners ask for a plan on Billing; the
 * team is emailed, sees it in /admin/plan-requests, takes payment (Mobile
 * Money, outside WazaBolt for now) and approves or declines — the customer
 * is emailed either way. Approving records the payment and runs
 * approve_plan_change: a new period (month or year), or for a renewal the
 * next period after the current one.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type Lang = "en" | "fr";

export type PlanRequestRow = {
  id: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  /** currency: the business's own. */
  business: { id: string; name: string; currency: string; school: boolean };
  requester: { name: string; email: string | null; locale: Lang } | null;
  from: { id: string; name: string; price: number } | null;
  to: { id: string; name: string; price: number };
  contactPhone: string | null;
  note: string | null;
  interval: BillingInterval;
  kind: "change" | "renewal" | "branches" | "topup";
  /** The AI add-on asked for with the plan (or "ai_topup" for a top-up); null: none. */
  addonId: string | null;
  /** The business's one-off setup fee, while it's still owed (0: none). Collected with this payment. */
  setupFeeDue: number;
  /** For a "branches" request: the number of extra branches asked for (in total). */
  extraBranches: number | null;
  /** What the business pays for this request (in `currency`; per month for extra branches), the setup fee included while owed. */
  amountDue: number;
  /** The currency of amountDue and of the payment to record: the business's when its plans are priced in it, else FCFA. */
  currency: string;
};

/** The period price of a plan with its AI add-on (a bundle at its set price); an old plan at its stored price. */
function requestPrice(planId: string, addonId: string | null, interval: BillingInterval, storedMonthly: number, currency: string) {
  const local = currency === "XAF" ? null : catalogFor(currency);
  const plan = local?.plans.find((p) => p.id === planId);
  if (local && plan) return quote(plan.id, null, interval, local).period;
  if (!isPlanOnSale(planId)) return periodPrice(storedMonthly, interval);
  return quote(planId, addonId && isAddonId(addonId) ? addonId : null, interval).period;
}

/** A plan request is paid in the business's currency when its plans are priced in it; extra shops and top-ups (and anything else) in FCFA. */
const requestCurrency = (businessCurrency: string, kind: string) => (kind !== "branches" && kind !== "topup" && businessCurrency !== "XAF" && catalogFor(businessCurrency) ? planCurrencyFor(businessCurrency) : "XAF");

const fcfa = (n: number, lang: Lang = "en") => `${new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(n).replace(/ | /g, " ")} FCFA`;
const amount = (n: number, currency: string) => (currency === "XAF" ? fcfa(n) : formatAmount(n, currency, "en"));
const site = () => siteConfig.url.replace(/\/$/, "");

export async function pendingPlanRequestCount(admin: Admin) {
  const { count } = await admin.from("plan_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

async function loadRequests(admin: Admin, filter: { id?: string; limit?: number }): Promise<PlanRequestRow[]> {
  let q = admin
    .from("plan_change_requests")
    .select("id, status, created_at, decided_at, business_id, from_plan_id, to_plan_id, addon_id, contact_phone, note, requested_by, billing_interval, kind, extra_branches")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.id) q = q.eq("id", filter.id);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const businessIds = [...new Set(rows.map((r) => r.business_id))];
  const [businesses, plans, users, subs] = await Promise.all([
    admin.from("businesses").select("id, name, currency, industry").in("id", businessIds),
    admin.from("plans").select("id, name, monthly_price, extra_branch_price"),
    admin.from("users").select("id, full_name, email, ui_locale").in("id", [...new Set(rows.map((r) => r.requested_by).filter((x): x is string => !!x))]),
    admin.from("subscriptions").select("business_id, setup_fee, setup_fee_paid_at").in("business_id", businessIds),
  ]);
  const plan = (id: string | null) => {
    const p = (plans.data ?? []).find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, price: Number(p.monthly_price) } : null;
  };
  const setupFeeDue = (businessId: string) => {
    const sub = (subs.data ?? []).find((x) => x.business_id === businessId);
    return sub && !sub.setup_fee_paid_at ? Number(sub.setup_fee) : 0;
  };
  return rows.map((r) => {
    const u = (users.data ?? []).find((x) => x.id === r.requested_by);
    const to = plan(r.to_plan_id) ?? { id: r.to_plan_id, name: r.to_plan_id, price: 0 };
    const interval: BillingInterval = r.billing_interval === "year" ? "year" : "month";
    const biz = (businesses.data ?? []).find((b) => b.id === r.business_id);
    const currency = requestCurrency(biz?.currency ?? "XAF", r.kind);
    // The setup fee is in FCFA: only collected with an FCFA payment.
    const setupFee = (r.kind === "change" || r.kind === "renewal") && currency === "XAF" ? setupFeeDue(r.business_id) : 0;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      business: { id: r.business_id, name: biz?.name ?? "—", currency: biz?.currency ?? "XAF", school: biz?.industry === "school" },
      currency,
      requester: u ? { name: u.full_name, email: u.email, locale: u.ui_locale === "fr" ? "fr" : "en" } : null,
      from: plan(r.from_plan_id),
      to,
      contactPhone: r.contact_phone,
      note: r.note,
      interval,
      kind: r.kind === "renewal" ? "renewal" : r.kind === "branches" ? "branches" : r.kind === "topup" ? "topup" : "change",
      addonId: r.addon_id,
      extraBranches: r.extra_branches,
      setupFeeDue: setupFee,
      amountDue:
        r.kind === "branches"
          ? (r.extra_branches ?? 0) * Number((plans.data ?? []).find((x) => x.id === r.to_plan_id)?.extra_branch_price ?? 0)
          : r.kind === "topup"
            ? AI_TOPUP.price
            : requestPrice(r.to_plan_id, r.addon_id, interval, to.price, currency) + setupFee,
    };
  });
}

/** Pending requests first (oldest waiting longest on top), then the latest decisions. */
export async function listPlanRequests(admin: Admin) {
  const rows = await loadRequests(admin, { limit: 100 });
  return {
    pending: rows.filter((r) => r.status === "pending").reverse(),
    decided: rows.filter((r) => r.status !== "pending").slice(0, 30),
  };
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

/** One line for what was asked: "Starter → Business, monthly: 25,000 FCFA" or "2 extra branches on Business: 10,000 FCFA/month". */
export function requestSummary(r: PlanRequestRow, html = false) {
  const b = (x: string) => (html ? `<b>${esc(x)}</b>` : x);
  if (r.kind === "branches") return `${b(`${r.extraBranches ?? 0} extra branch${r.extraBranches === 1 ? "" : "es"}`)} on ${html ? esc(r.to.name) : r.to.name}: ${amount(r.amountDue, r.currency)}/month`;
  if (r.kind === "topup") return `${b(`AI top-up (+${AI_TOPUP.conversations} conversations)`)}: ${amount(r.amountDue, r.currency)}`;
  // For the team: the plan, with the name the school sees.
  const toName = r.business.school && planNameFor(r.to.id, r.to.name, true, "en") !== r.to.name ? `${r.to.name} (${planNameFor(r.to.id, r.to.name, true, "en")})` : r.to.name;
  const to = r.addonId ? `${toName} + ${r.addonId === "ai_plus" ? "AI Plus" : "AI Basic"}` : toName;
  const what = r.kind === "renewal" ? `Renewal of ${b(to)}` : `${html ? esc(r.from?.name ?? "—") : (r.from?.name ?? "—")} → ${b(to)}`;
  return `${what}, ${r.interval === "year" ? "yearly" : "monthly"}: ${amount(r.amountDue, r.currency)}${r.currency !== "XAF" ? " by bank transfer (they see the bank details on Billing once they are saved in admin; otherwise send them)" : ""}${r.setupFeeDue ? ` (setup fee ${fcfa(r.setupFeeDue)} included)` : ""}`;
}

/** To the WazaBolt team, right after a business asks for a plan. */
export async function notifyTeamOfPlanRequest(admin: Admin, requestId: string) {
  const [r] = await loadRequests(admin, { id: requestId });
  if (!r) return;
  const link = `${site()}/en/admin/plan-requests`;
  const rows: [string, string][] = [
    ["Business", esc(r.business.name)],
    ["Requested by", r.requester ? `${esc(r.requester.name || "—")}${r.requester.email ? ` &lt;${esc(r.requester.email)}&gt;` : ""}` : "—"],
    [r.kind === "branches" ? "Branches" : "Plan", requestSummary(r, true)],
    ["Phone to call", esc(r.contactPhone ?? "—")],
    ["Note", esc(r.note ?? "—")],
  ];
  await sendEmail({
    to: siteConfig.email.teamInbox,
    subject: r.kind === "branches" ? `[WazaBolt] Extra branches – ${r.business.name}: ${r.extraBranches ?? 0}` : `[WazaBolt] New plan request – ${r.business.name} → ${r.to.name}`,
    html: emailLayout({
      title: "New plan request",
      intro:
        r.kind === "branches"
          ? `${esc(r.business.name)} asked for <b>${r.extraBranches ?? 0}</b> extra branch${r.extraBranches === 1 ? "" : "es"} in total. Once they have paid, approve it in WazaBolt admin.`
          : `${esc(r.business.name)} asked for the <b>${esc(r.to.name)}</b> plan. Once they have paid, approve it in WazaBolt admin.`,
      rows,
      button: { label: "Open plan requests", href: link },
      footer: "You receive this because you are on the WazaBolt team.",
    }),
    text: `New plan request\n\n${r.business.name}: ${requestSummary(r)}\nRequested by: ${r.requester?.name ?? "—"} ${r.requester?.email ?? ""}\nPhone: ${r.contactPhone ?? "—"}\nNote: ${r.note ?? "—"}\n\n${link}`,
  });
}

const BRANCHES_APPROVED = {
  en: (count: number) => ({
    subject: "Your extra WazaBolt branches are active",
    title: "Your extra branches are active",
    intro: `Thank you! Your business can now have <b>${count}</b> extra branch${count === 1 ? "" : "es"}. Open them in Branches.`,
    button: "Open Branches",
  }),
  fr: (count: number) => ({
    subject: "Vos succursales WazaBolt supplémentaires sont activées",
    title: "Vos succursales supplémentaires sont activées",
    intro: `Merci ! Votre entreprise peut maintenant avoir <b>${count}</b> succursale${count === 1 ? "" : "s"} supplémentaire${count === 1 ? "" : "s"}. Ouvrez-les dans Succursales.`,
    button: "Ouvrir Succursales",
  }),
};

const CUSTOMER = {
  approved: {
    en: (plan: string, until: string, school = false) => ({
      subject: `Your WazaBolt ${plan} plan is active`,
      title: `Your ${plan} plan is active`,
      intro: `Thank you! Your ${school ? "school" : "business"} is now on the <b>${esc(plan)}</b> plan, until ${esc(until)}. Your new AI conversation allowance applies straight away.`,
      button: "Open my dashboard",
    }),
    fr: (plan: string, until: string, school = false) => ({
      subject: `Votre forfait WazaBolt ${plan} est activé`,
      title: `Votre forfait ${plan} est activé`,
      intro: `Merci ! Votre ${school ? "école" : "entreprise"} est maintenant au forfait <b>${esc(plan)}</b>, jusqu'au ${esc(until)}. Votre nouveau quota de conversations IA s'applique dès maintenant.`,
      button: "Ouvrir mon tableau de bord",
    }),
  },
  rejected: {
    en: (plan: string) => ({
      subject: `About your WazaBolt ${plan} plan request`,
      title: "We couldn't activate your plan yet",
      intro: `Your request for the <b>${esc(plan)}</b> plan wasn't activated — usually because the payment hasn't reached us. Reply to this email or message us on WhatsApp at ${esc(siteConfig.contact.phone)} and we'll sort it out.`,
      button: "Open Billing",
    }),
    fr: (plan: string) => ({
      subject: `Votre demande de forfait WazaBolt ${plan}`,
      title: "Nous n'avons pas encore pu activer votre forfait",
      intro: `Votre demande de forfait <b>${esc(plan)}</b> n'a pas été activée — en général parce que le paiement ne nous est pas parvenu. Répondez à cet e-mail ou écrivez-nous sur WhatsApp au ${esc(siteConfig.contact.phone)} et nous réglerons cela.`,
      button: "Ouvrir la facturation",
    }),
  },
};
const FOOTER = {
  en: "WazaBolt · www.wazabolt.com · Questions? Just reply to this email.",
  fr: "WazaBolt · www.wazabolt.com · Une question ? Répondez simplement à cet e-mail.",
};

async function emailCustomer(r: PlanRequestRow, decision: "approved" | "rejected", periodEnd: string | null) {
  if (!r.requester?.email) return;
  const lang = r.requester.locale;
  const until = periodEnd ? new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Douala" }).format(new Date(periodEnd)) : "";
  const branches = r.kind === "branches" && decision === "approved";
  // A school reads its plan under the school name (School Standard…).
  const plan = planNameFor(r.to.id, r.to.name, r.business.school, lang);
  const t = branches ? BRANCHES_APPROVED[lang](r.extraBranches ?? 0) : decision === "approved" ? CUSTOMER.approved[lang](plan, until, r.business.school) : CUSTOMER.rejected[lang](plan);
  const href = `${site()}/${lang}/dashboard${branches ? "/branches" : decision === "approved" ? "" : "/billing"}`;
  await sendEmail({
    to: r.requester.email,
    subject: t.subject,
    html: emailLayout({ title: t.title, intro: t.intro, button: { label: t.button, href }, footer: FOOTER[lang] }),
    text: `${t.title}\n\n${t.intro.replace(/<[^>]+>/g, "")}\n\n${href}`,
  });
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** Approving records the payment received (amount, method, reference) with the plan change. */
export async function decidePlanRequest(admin: Admin, requestId: string, decision: "approved" | "rejected", payment?: PaymentRecord) {
  const [r] = await loadRequests(admin, { id: requestId });
  if (!r || r.status !== "pending") return { ok: false as const, error: "not_pending" as const };
  const { error } =
    decision === "approved"
      ? await admin.rpc("approve_plan_change", {
          p_request_id: requestId,
          p_amount: payment?.amount,
          p_method: payment?.method,
          p_reference: payment?.reference ?? undefined,
          p_actor: payment?.actorUserId ?? undefined,
          p_grace_days: PAYMENT_GRACE_DAYS,
          p_setup_fee_paid: payment?.setupFeePaid ?? false,
        })
      : await admin.rpc("reject_plan_change", { p_request_id: requestId });
  if (error) {
    logServerError("admin.planDecision", error);
    return { ok: false as const, error: "failed" as const };
  }
  let periodEnd: string | null = null;
  if (decision === "approved") {
    const { data } = await admin.from("subscriptions").select("current_period_end").eq("business_id", r.business.id).maybeSingle();
    periodEnd = data?.current_period_end ?? null;
  }
  await emailCustomer(r, decision, periodEnd);
  return { ok: true as const };
}
