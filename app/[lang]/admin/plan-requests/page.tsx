import type { Metadata } from "next";
import { Check, X } from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader, Panel, StatusBadge, TableWrap, td, th } from "@/components/app/ui";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { listPlanRequests, pendingPlanRequestCount, type PlanRequestRow } from "@/lib/admin/plan-requests";
import { approvePlanRequest, declinePlanRequest } from "@/lib/actions/admin";
import { emailConfigured } from "@/lib/email/send";
import { getLocale } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = { title: "Plan requests", robots: { index: false, follow: false } };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" });
const fcfa = (n: number) => `${new Intl.NumberFormat("en-US").format(n)} FCFA`;
const field = "h-9 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";
const NOTICES: Record<string, { tone: "green" | "red"; text: string }> = {
  approved: { tone: "green", text: "Approved — the payment is recorded, the business is on its plan and the customer has been emailed." },
  rejected: { tone: "green", text: "Declined — the customer has been emailed." },
  not_pending: { tone: "red", text: "That request was already decided or cancelled." },
  failed: { tone: "red", text: "Something went wrong; nothing was changed. Try again." },
  forbidden: { tone: "red", text: "Only the WazaBolt team can do that." },
  invalid: { tone: "red", text: "Unknown request." },
  payment: { tone: "red", text: "Enter the amount received (0 or more) to approve." },
};

/**
 * WazaBolt team only: businesses asking for a plan or a renewal. Take the
 * payment (Mobile Money, outside WazaBolt for now), then approve with the
 * amount received — the plan starts (or a renewal continues the current
 * period) and the customer is emailed. Declining emails them too.
 */
export default async function PlanRequestsPage({ searchParams }: PageProps<"/[lang]/admin/plan-requests">) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const admin = await requirePlatformAdmin(locale, "/admin/plan-requests");
  const [{ pending, decided }, waiting] = await Promise.all([listPlanRequests(admin), pendingPlanRequestCount(admin)]);
  const key = typeof params.done === "string" ? params.done : typeof params.error === "string" ? params.error : null;
  const notice = key ? NOTICES[key] : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <AdminNav locale={locale} active="plan-requests" pendingPlanRequests={waiting} />
      <PageHeader title="Plan requests" description="Businesses asking for a plan or a renewal, monthly or yearly. Approve once they have paid, with the amount received: a new plan starts now; a renewal follows on from the current period. The customer gets an email." />
      {notice ? (
        <p role="status" className={notice.tone === "green" ? "rounded-2xl bg-success-bg p-4 text-sm font-semibold text-success" : "rounded-2xl bg-coral-50 p-4 text-sm font-semibold text-coral-700"}>
          {notice.text}
        </p>
      ) : null}
      {!emailConfigured() ? (
        <p className="rounded-2xl bg-gold-50 p-4 text-sm text-gold-800">Emails are off: add RESEND_API_KEY in Vercel to be notified of new requests and to email customers.</p>
      ) : null}

      <Panel id="pending" title={`Waiting for you (${pending.length})`}>
        {pending.length ? (
          <ul className="flex flex-col gap-4">
            {pending.map((r) => (
              <PendingCard key={r.id} r={r} locale={locale} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">No requests waiting.</p>
        )}
      </Panel>

      <Panel id="decided" title="Recent decisions">
        {decided.length ? (
          <TableWrap>
            <thead>
              <tr>
                {["Requested", "Business", "Plan", "Status", "Decided"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap text-slate`}>{when.format(new Date(r.createdAt))}</td>
                  <td className={td}>{r.business.name}</td>
                  <td className={td}>
                    {r.kind === "renewal" ? `Renewal of ${r.to.name}` : `${r.from?.name ?? "—"} → ${r.to.name}`} ({r.interval === "year" ? "yearly" : "monthly"})
                  </td>
                  <td className={td}>
                    <StatusBadge tone={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "neutral"}>{r.status}</StatusBadge>
                  </td>
                  <td className={`${td} whitespace-nowrap text-slate`}>{r.decidedAt ? when.format(new Date(r.decidedAt)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-slate">Nothing decided yet.</p>
        )}
      </Panel>
    </main>
  );
}

function PendingCard({ r, locale }: { r: PlanRequestRow; locale: string }) {
  return (
    <li data-request-id={r.id} className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="font-display text-lg font-bold text-deep">{r.business.name}</p>
        <p className="mt-1">
          {r.kind === "renewal" ? (
            <>
              <StatusBadge tone="blue">Renewal</StatusBadge> <b>{r.to.name}</b>
            </>
          ) : (
            <>
              {r.from?.name ?? "—"} → <b>{r.to.name}</b>
            </>
          )}{" "}
          · {r.interval === "year" ? "yearly" : "monthly"}: <b>{fcfa(r.amountDue)}</b>
        </p>
        <p className="mt-1 text-slate">
          {r.requester ? (
            <>
              {r.requester.name || "—"}
              {r.requester.email ? (
                <>
                  {" · "}
                  <a href={`mailto:${r.requester.email}`} className="text-waza-700 hover:underline">
                    {r.requester.email}
                  </a>
                </>
              ) : null}
            </>
          ) : (
            "—"
          )}
          {r.contactPhone ? (
            <>
              {" · "}
              <a href={`tel:${r.contactPhone.replace(/\s+/g, "")}`} className="text-waza-700 hover:underline">
                {r.contactPhone}
              </a>
            </>
          ) : null}
        </p>
        {r.note ? <p className="mt-2 rounded-xl bg-surface p-3 text-deep">“{r.note}”</p> : null}
        <p className="mt-2 text-xs text-slate">Asked {when.format(new Date(r.createdAt))} (Cameroon time)</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <form action={approvePlanRequest} className="grid w-full gap-2 sm:w-80" aria-label={`Approve ${r.business.name}`}>
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="locale" value={locale} />
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate">
              Amount received (FCFA)
              <input name="amount" type="number" min={0} step={1} required defaultValue={r.amountDue} className={field} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate">
              Paid by
              <select name="method" defaultValue="mobile_money" className={field}>
                <option value="mobile_money">Mobile Money</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-slate">
            Reference (optional)
            <input name="reference" maxLength={100} placeholder="Mobile Money transaction ID" className={field} />
          </label>
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-waza-500 px-4 py-2 text-sm font-bold text-deep hover:bg-waza-600">
            <Check className="size-4" aria-hidden /> Approve
          </button>
        </form>
        <form action={declinePlanRequest}>
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-slate hover:border-coral-500 hover:text-coral-700">
            <X className="size-4" aria-hidden /> Decline
          </button>
        </form>
      </div>
    </li>
  );
}
