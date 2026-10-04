import "server-only";

import { PAYMENT_GRACE_DAYS, periodPrice, type BillingInterval } from "@/config/economics";
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
  business: { id: string; name: string };
  requester: { name: string; email: string | null; locale: Lang } | null;
  from: { id: string; name: string; price: number } | null;
  to: { id: string; name: string; price: number };
  contactPhone: string | null;
  note: string | null;
  interval: BillingInterval;
  kind: "change" | "renewal";
  /** What the business pays for this request (FCFA). */
  amountDue: number;
};

const fcfa = (n: number, lang: Lang = "en") => `${new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(n).replace(/ | /g, " ")} FCFA`;
const site = () => siteConfig.url.replace(/\/$/, "");

export async function pendingPlanRequestCount(admin: Admin) {
  const { count } = await admin.from("plan_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

async function loadRequests(admin: Admin, filter: { id?: string; limit?: number }): Promise<PlanRequestRow[]> {
  let q = admin
    .from("plan_change_requests")
    .select("id, status, created_at, decided_at, business_id, from_plan_id, to_plan_id, contact_phone, note, requested_by, billing_interval, kind")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.id) q = q.eq("id", filter.id);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const [businesses, plans, users] = await Promise.all([
    admin.from("businesses").select("id, name").in("id", [...new Set(rows.map((r) => r.business_id))]),
    admin.from("plans").select("id, name, monthly_price"),
    admin.from("users").select("id, full_name, email, ui_locale").in("id", [...new Set(rows.map((r) => r.requested_by).filter((x): x is string => !!x))]),
  ]);
  const plan = (id: string | null) => {
    const p = (plans.data ?? []).find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, price: Number(p.monthly_price) } : null;
  };
  return rows.map((r) => {
    const u = (users.data ?? []).find((x) => x.id === r.requested_by);
    const to = plan(r.to_plan_id) ?? { id: r.to_plan_id, name: r.to_plan_id, price: 0 };
    const interval: BillingInterval = r.billing_interval === "year" ? "year" : "month";
    return {
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      business: { id: r.business_id, name: (businesses.data ?? []).find((b) => b.id === r.business_id)?.name ?? "—" },
      requester: u ? { name: u.full_name, email: u.email, locale: u.ui_locale === "fr" ? "fr" : "en" } : null,
      from: plan(r.from_plan_id),
      to,
      contactPhone: r.contact_phone,
      note: r.note,
      interval,
      kind: r.kind === "renewal" ? "renewal" : "change",
      amountDue: periodPrice(to.price, interval),
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

/** To the WazaBolt team, right after a business asks for a plan. */
export async function notifyTeamOfPlanRequest(admin: Admin, requestId: string) {
  const [r] = await loadRequests(admin, { id: requestId });
  if (!r) return;
  const link = `${site()}/en/admin/plan-requests`;
  const rows: [string, string][] = [
    ["Business", esc(r.business.name)],
    ["Requested by", r.requester ? `${esc(r.requester.name || "—")}${r.requester.email ? ` &lt;${esc(r.requester.email)}&gt;` : ""}` : "—"],
    ["Plan", `${r.kind === "renewal" ? `Renewal of <b>${esc(r.to.name)}</b>` : `${esc(r.from?.name ?? "—")} → <b>${esc(r.to.name)}</b>`}, ${r.interval === "year" ? "yearly" : "monthly"}: ${fcfa(r.amountDue)}`],
    ["Phone to call", esc(r.contactPhone ?? "—")],
    ["Note", esc(r.note ?? "—")],
  ];
  await sendEmail({
    to: siteConfig.email.teamInbox,
    subject: `[WazaBolt] New plan request – ${r.business.name} → ${r.to.name}`,
    html: emailLayout({
      title: "New plan request",
      intro: `${esc(r.business.name)} asked for the <b>${esc(r.to.name)}</b> plan. Once they have paid, approve it in WazaBolt admin.`,
      rows,
      button: { label: "Open plan requests", href: link },
      footer: "You receive this because you are on the WazaBolt team.",
    }),
    text: `New plan request\n\n${r.business.name}: ${r.kind === "renewal" ? `renewal of ${r.to.name}` : `${r.from?.name ?? "—"} → ${r.to.name}`}, ${r.interval === "year" ? "yearly" : "monthly"}: ${fcfa(r.amountDue)}\nRequested by: ${r.requester?.name ?? "—"} ${r.requester?.email ?? ""}\nPhone: ${r.contactPhone ?? "—"}\nNote: ${r.note ?? "—"}\n\n${link}`,
  });
}

const CUSTOMER = {
  approved: {
    en: (plan: string, until: string) => ({
      subject: `Your WazaBolt ${plan} plan is active`,
      title: `Your ${plan} plan is active`,
      intro: `Thank you! Your business is now on the <b>${esc(plan)}</b> plan, until ${esc(until)}. Your new AI conversation allowance applies straight away.`,
      button: "Open my dashboard",
    }),
    fr: (plan: string, until: string) => ({
      subject: `Votre forfait WazaBolt ${plan} est activé`,
      title: `Votre forfait ${plan} est activé`,
      intro: `Merci ! Votre entreprise est maintenant au forfait <b>${esc(plan)}</b>, jusqu'au ${esc(until)}. Votre nouveau quota de conversations IA s'applique dès maintenant.`,
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
  const t = decision === "approved" ? CUSTOMER.approved[lang](r.to.name, until) : CUSTOMER.rejected[lang](r.to.name);
  const href = `${site()}/${lang}/dashboard${decision === "approved" ? "" : "/billing"}`;
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
