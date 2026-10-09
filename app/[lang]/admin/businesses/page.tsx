import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader, Panel, StatusBadge, TableWrap, td, th } from "@/components/app/ui";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { listAllBusinesses, signupCounts } from "@/lib/admin/businesses";
import { pendingPlanRequestCount } from "@/lib/admin/plan-requests";
import { setAiPaused } from "@/lib/actions/admin";
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
};

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
  const [rows, waiting] = await Promise.all([listAllBusinesses(admin), pendingPlanRequestCount(admin)]);
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
                {["Business", "Signed up", "Owner", "Plan", "Setup", "WhatsApp", "Team", "Assistant"].map((h) => (
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
                  <td className={`${td} capitalize`}>
                    {b.planId ?? "—"}
                    {b.planId && b.planId !== "free" ? <span className="block text-xs normal-case text-slate">{b.interval === "year" ? "yearly" : "monthly"}{b.periodEnd ? `, until ${day.format(new Date(b.periodEnd))}` : ""}</span> : null}
                    {b.planStatus && b.planStatus !== "active" ? <StatusBadge tone="amber">{b.planStatus === "past_due" ? "payment due" : b.planStatus}</StatusBadge> : null}
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
