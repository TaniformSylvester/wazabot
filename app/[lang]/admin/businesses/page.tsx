import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader, Panel, StatusBadge, TableWrap, td, th } from "@/components/app/ui";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { listAllBusinesses, signupCounts } from "@/lib/admin/businesses";
import { pendingPlanRequestCount } from "@/lib/admin/plan-requests";
import { extendTrial, recordManualPayment, setAiLaunched, setAiPaused, setSetupFee } from "@/lib/actions/admin";
import { ADDONS, PLANS_ON_SALE, SETUP_FEE_RANGE } from "@/config/economics";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = { title: "Businesses", robots: { index: false, follow: false } };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Douala" });
const NOTICES: Record<string, { ok: boolean; text: string }> = {
  paused: { ok: true, text: "Assistant paused: it stays silent and the business's messages wait for its team. The business sees a notice." },
  resumed: { ok: true, text: "Assistant switched back on." },
  forbidden: { ok: false, text: "Only the WazaBolt team can do that." },
  invalid: { ok: false, text: "Unknown business." },
  failed: { ok: false, text: "Something went wrong; nothing was changed." },
  payment: { ok: true, text: "Payment recorded: the plan is switched on and the owner is emailed." },
  setup_fee: { ok: true, text: "Setup fee saved. It is added to the business's next payment." },
  trial: { ok: true, text: "Trial extended." },
  ai_on: { ok: true, text: "The AI assistant is launched: businesses can now add it and start their AI trial." },
  ai_off: { ok: true, text: "The AI assistant is back to “coming soon”: nobody can add it, and assistants stop answering." },
  ai_not_launched: { ok: false, text: "The AI assistant isn't launched yet: record the plan without the add-on." },
  paid_plan: { ok: false, text: "This business is on a paid plan: a trial can't be added." },
  payment_invalid: { ok: false, text: "Enter the amount received and how it was paid." },
  setup_fee_invalid: { ok: false, text: "The setup fee is 0 (none) or between 10,000 and 25,000 FCFA, and only for businesses paying in FCFA." },
};
const PLAN_NAMES: Record<string, string> = { free: "No plan", boutique: "Boutique", business: "Business", multishop: "Multi-shop", starter: "Starter (old)", pro: "Pro (old)" };
const ADDON_NAMES: Record<string, string> = { ai_basic: "AI Basic", ai_plus: "AI Plus" };
const small = "h-9 min-w-0 rounded-lg border border-input bg-card px-2 text-xs text-deep";
const smallButton = "inline-flex min-h-8 items-center justify-center rounded-full bg-deep px-3 text-xs font-bold text-white hover:bg-deep/90";

/**
 * WazaBolt team only: every business that signed up, newest first — who owns
 * it, plan, whether setup is finished and WhatsApp connected. Account facts
 * only; a business's customers and conversations are never shown here.
 */
export default async function BusinessesAdminPage({ searchParams }: PageProps<"/[lang]/admin/businesses">) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const key = typeof params.done === "string" ? params.done : typeof params.error === "string" ? params.error : null;
  const notice = key ? NOTICES[key] : null;
  const admin = await requirePlatformAdmin(locale, "/admin/businesses");
  const [rows, waiting, launched] = await Promise.all([
    listAllBusinesses(admin),
    pendingPlanRequestCount(admin),
    (createAdminClient()?.rpc("ai_assistant_launched") ?? Promise.resolve({ data: false })).then((r) => r.data === true),
  ]);
  const counts = signupCounts(rows, new Date());
  const stats = [
    { label: "Businesses", value: counts.total },
    { label: "New in the last 7 days", value: counts.last7 },
    { label: "New in the last 30 days", value: counts.last30 },
    { label: "WhatsApp connected", value: counts.whatsappConnected },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6">
      <AdminNav locale={locale} active="businesses" pendingPlanRequests={waiting} />
      <PageHeader title="Businesses" description="Everyone who signed up for WazaBolt, newest first. Times are Cameroon time. Pause stops a business's assistant (kill switch) until you switch it back on." />
      {notice ? (
        <p role="status" className={notice.ok ? "rounded-2xl bg-success-bg p-4 text-sm font-semibold text-success" : "rounded-2xl bg-coral-50 p-4 text-sm font-semibold text-coral-700"}>
          {notice.text}
        </p>
      ) : null}

      <Panel id="ai-launch" title="WhatsApp AI assistant">
        <form action={setAiLaunched} className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="on" value={launched ? "0" : "1"} />
          <StatusBadge tone={launched ? "green" : "amber"}>{launched ? "Launched" : "Coming soon"}</StatusBadge>
          <span className="text-slate">
            {launched
              ? "Businesses can add the AI add-on and start their AI trial."
              : "Shown as “coming soon” everywhere; it can't be added or bought, and no assistant answers customers."}
          </span>
          <button type="submit" className={launched ? "inline-flex min-h-9 items-center rounded-full border border-border px-4 text-xs font-semibold text-slate hover:border-coral-500 hover:text-coral-700" : smallButton}>
            {launched ? "Back to coming soon" : "Launch the AI assistant"}
          </button>
        </form>
      </Panel>

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold text-slate">{s.label}</p>
            <p className="font-display text-2xl font-bold text-deep">{s.value}</p>
          </li>
        ))}
      </ul>

      <Panel id="all-businesses" title="All sign-ups">
        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                {["Business", "Signed up", "Owner", "Plan", "Billing", "Setup", "WhatsApp", "Team", "Assistant"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} data-business-id={b.id}>
                  <td className={td}>
                    <span className="font-semibold">{b.name}</span>
                    {b.city || b.industry ? <span className="block text-xs text-slate">{[b.industry, b.city].filter(Boolean).join(" · ")}</span> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap text-slate`}>{when.format(new Date(b.createdAt))}</td>
                  <td className={td}>
                    {b.owner ? (
                      <>
                        <span>{b.owner.name || "—"}</span>
                        {b.owner.email ? (
                          <a href={`mailto:${b.owner.email}`} className="block py-1 text-xs text-waza-700 hover:underline">
                            {b.owner.email}
                          </a>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={td}>
                    <span className="font-semibold">{PLAN_NAMES[b.planId ?? ""] ?? b.planId ?? "—"}</span>
                    {b.addonId ? <span className="block text-xs text-slate">+ {ADDON_NAMES[b.addonId] ?? b.addonId}</span> : null}
                    {b.planId && b.planId !== "free" ? (
                      <span className="block text-xs text-slate">
                        {b.planStatus === "trialing" ? "trial" : b.interval === "year" ? "yearly" : "monthly"}
                        {b.periodEnd ? `, until ${day.format(new Date(b.periodEnd))}` : ""}
                      </span>
                    ) : null}
                    {b.planStatus === "past_due" ? <StatusBadge tone="amber">payment due</StatusBadge> : null}
                    {b.setupFee > 0 ? <span className="block text-xs text-slate">Setup fee {b.setupFee.toLocaleString("en-US")} FCFA{b.setupFeePaid ? " (paid)" : " (owed)"}</span> : null}
                  </td>
                  <td className={td}>
                    <details className="w-64" data-testid="admin-billing">
                      <summary className="cursor-pointer text-xs font-semibold text-waza-700">Payment, setup fee, trial</summary>
                      <form action={recordManualPayment} className="mt-2 grid gap-1.5" aria-label={`Record a payment for ${b.name}`}>
                        <input type="hidden" name="business_id" value={b.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <p className="text-xs font-semibold text-deep">Record a payment</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <select name="plan_id" defaultValue={b.planId && PLANS_ON_SALE.includes(b.planId as never) ? b.planId : "business"} className={small} aria-label="Plan">
                            {PLANS_ON_SALE.map((p) => (
                              <option key={p} value={p}>
                                {PLAN_NAMES[p]}
                              </option>
                            ))}
                          </select>
                          <select name="billing_interval" defaultValue={b.interval} className={small} aria-label="Billing">
                            <option value="month">Monthly</option>
                            <option value="year">Yearly</option>
                          </select>
                        </div>
                        {launched ? (
                          <select name="addon_id" defaultValue={b.addonId ?? ""} className={small} aria-label="AI add-on">
                            <option value="">No AI add-on</option>
                            {ADDONS.map((a) => (
                              <option key={a.id} value={a.id}>
                                {ADDON_NAMES[a.id]}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <div className="grid grid-cols-2 gap-1.5">
                          <input name="amount" type="number" min={0} step={b.currency === "XAF" ? 1 : 0.01} required placeholder={`Amount (${b.currency === "XAF" ? "FCFA" : b.currency})`} className={small} aria-label={`Amount received (${b.currency === "XAF" ? "FCFA" : b.currency})`} />
                          <select name="method" defaultValue={b.currency === "XAF" ? "mobile_money" : "bank"} className={small} aria-label="Paid by">
                            <option value="mobile_money">Mobile Money</option>
                            <option value="cash">Cash</option>
                            <option value="bank">Bank transfer</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <input name="reference" maxLength={100} placeholder="MTN MoMo / Orange Money transaction ID" className={small} aria-label="Reference" />
                        {b.setupFee > 0 && !b.setupFeePaid ? (
                          <label className="flex items-center gap-1.5 text-xs text-slate">
                            <input type="checkbox" name="setup_fee_paid" defaultChecked className="accent-waza-600" /> Includes the setup fee
                          </label>
                        ) : null}
                        <button type="submit" className={smallButton}>
                          Record payment
                        </button>
                      </form>
                      {/* The setup fee is in FCFA: only for FCFA businesses. */}
                      {b.currency === "XAF" ? (
                      <form action={setSetupFee} className="mt-3 flex items-end gap-1.5" aria-label={`Setup fee for ${b.name}`}>
                        <input type="hidden" name="business_id" value={b.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-deep">
                          Setup fee (0 or {SETUP_FEE_RANGE.min.toLocaleString("en-US")}–{SETUP_FEE_RANGE.max.toLocaleString("en-US")})
                          <input name="setup_fee" type="number" min={0} max={SETUP_FEE_RANGE.max} step={500} defaultValue={b.setupFee} className={small} />
                        </label>
                        <button type="submit" className={smallButton}>
                          Save
                        </button>
                      </form>
                      ) : null}
                      {b.planStatus === "trialing" || b.planId === "free" ? (
                        <form action={extendTrial} className="mt-3 flex items-end gap-1.5" aria-label={`Extend the trial of ${b.name}`}>
                          <input type="hidden" name="business_id" value={b.id} />
                          <input type="hidden" name="locale" value={locale} />
                          <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-deep">
                            Extend the trial by (days)
                            <input name="days" type="number" min={1} max={90} defaultValue={7} className={small} />
                          </label>
                          <button type="submit" className={smallButton}>
                            Extend
                          </button>
                        </form>
                      ) : null}
                    </details>
                  </td>
                  <td className={td}>{b.setupDone ? <StatusBadge tone="green">Done</StatusBadge> : <StatusBadge tone="amber">Not finished</StatusBadge>}</td>
                  <td className={td}>
                    {b.whatsapp?.status === "connected" ? (
                      <>
                        <StatusBadge tone="green">Connected</StatusBadge>
                        {b.whatsapp.number ? <span className="block pt-1 text-xs text-slate">{b.whatsapp.number}</span> : null}
                      </>
                    ) : (
                      <span className="text-slate">Not connected</span>
                    )}
                  </td>
                  <td className={td}>{b.members}</td>
                  <td className={td}>
                    <form action={setAiPaused} className="flex items-center gap-2">
                      <input type="hidden" name="business_id" value={b.id} />
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="pause" value={b.aiPaused ? "0" : "1"} />
                      {b.aiPaused ? <StatusBadge tone="red">Paused</StatusBadge> : null}
                      <button
                        type="submit"
                        className={
                          b.aiPaused
                            ? "inline-flex min-h-8 items-center rounded-full bg-waza-500 px-3.5 text-xs font-bold text-deep hover:bg-waza-600"
                            : "inline-flex min-h-8 items-center rounded-full border border-border px-3.5 text-xs font-semibold text-slate hover:border-coral-500 hover:text-coral-700"
                        }
                      >
                        {b.aiPaused ? "Resume" : "Pause"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-slate">No businesses yet.</p>
        )}
      </Panel>
    </main>
  );
}
