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
const NOTICES: Record<string, { tone: "green" | "red"; text: string }> = {
  approved: { tone: "green", text: "Approved — the business is on its new plan and the customer has been emailed." },
  rejected: { tone: "green", text: "Declined — the customer has been emailed." },
  not_pending: { tone: "red", text: "That request was already decided or cancelled." },
  failed: { tone: "red", text: "Something went wrong; nothing was changed. Try again." },
  forbidden: { tone: "red", text: "Only the WazaBolt team can do that." },
  invalid: { tone: "red", text: "Unknown request." },
};

/**
 * WazaBolt team only: businesses asking for a plan. Take the payment (Mobile
 * Money, outside WazaBolt for now), then approve — the plan switches at once
 * for one month and the customer is emailed. Declining emails them too.
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
      <PageHeader title="Plan requests" description="Businesses asking for a plan. Approve once they have paid: the plan starts now, for one month, and the customer gets an email." />
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
                    {r.from?.name ?? "—"} → {r.to.name}
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
          {r.from?.name ?? "—"} → <b>{r.to.name}</b> · {fcfa(r.to.price)} / month
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
      <div className="flex shrink-0 gap-2">
        <form action={approvePlanRequest}>
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-waza-500 px-4 py-2 text-sm font-bold text-deep hover:bg-waza-600">
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
