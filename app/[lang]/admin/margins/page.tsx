import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, Panel, StatusBadge, TableWrap, td, th } from "@/components/app/ui";
import { FCFA_PER_USD, MARGIN_TARGET, META_PRICING, MOBILE_MONEY_FEE_RATE } from "@/config/economics";
import { AdminNav } from "@/components/admin/admin-nav";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { pendingPlanRequestCount } from "@/lib/admin/plan-requests";
import { getMarginReport, reportMonth } from "@/lib/billing/margins";
import { localizePath } from "@/lib/i18n/paths";
import { getLocale } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Margins", robots: { index: false, follow: false } };

const fcfa = (v: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 }).format(v)} FCFA`;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const int = (v: number) => new Intl.NumberFormat("en-US").format(v);

/**
 * WazaBolt team only (platform_admins): revenue, Claude cost, payment fees and
 * margin per business and per plan, with Meta usage as an estimate (each
 * business pays Meta itself). Internal and English-only; anyone else gets a 404.
 */
export default async function MarginsPage({ searchParams }: PageProps<"/[lang]/admin/margins">) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const admin = await requirePlatformAdmin(locale, "/admin/margins");

  const month = reportMonth(typeof params.month === "string" ? params.month : undefined, new Date());
  const [report, waiting] = await Promise.all([getMarginReport(admin, month), pendingPlanRequestCount(admin)]);
  const [y, m] = month.split("-").map(Number);
  const shift = (d: number) => new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const href = (mm: string) => `${localizePath(locale, "/admin/margins")}?month=${mm}`;
  const flagged = report.businesses.filter((b) => b.flagged);
  const active = report.businesses.filter((b) => b.claude > 0 || b.revenue > 0 || b.whatsapp.service + b.whatsapp.utility + b.whatsapp.marketing > 0);

  return (
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6">
      <AdminNav locale={locale} active="margins" pendingPlanRequests={waiting} />
      <PageHeader
        title={`Margins — ${monthLabel}`}
        description={`Target: at least ${pct(MARGIN_TARGET)} gross margin on every paid plan after Claude and Mobile Money fees (${pct(MOBILE_MONEY_FEE_RATE)}). Costs in FCFA at ${FCFA_PER_USD} FCFA = $1.`}
        actions={
          <>
            <Link className="text-sm font-semibold text-waza-700 hover:underline" href={href(shift(-1))}>
              ← {shift(-1)}
            </Link>
            <Link className="text-sm font-semibold text-waza-700 hover:underline" href={href(shift(1))}>
              {shift(1)} →
            </Link>
          </>
        }
      />

      {report.drift.length ? (
        <p role="alert" className="rounded-2xl bg-coral-50 p-4 text-sm font-semibold text-coral-700">
          Plan prices or allowances in the database differ from config/economics.ts for: {report.drift.join(", ")}.
        </p>
      ) : null}

      <Panel id="plans" title="By plan" description="Revenue is the price of active (or past-due) subscriptions — there is no payment history yet. Free has no revenue: its Claude cost is acquisition cost.">
        <TableWrap>
          <thead>
            <tr>
              {["Plan", "Businesses", "Paying", "Revenue", "Claude", "Payment fees", "Margin", "AI conversations", "Meta (est., paid by businesses)"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.plans.map((p) => (
              <tr key={p.planId} data-plan={p.planId}>
                <td className={cn(td, "font-semibold capitalize")}>{p.planId}</td>
                <td className={td}>{int(p.businesses)}</td>
                <td className={td}>{int(p.paying)}</td>
                <td className={td}>{fcfa(p.revenue)}</td>
                <td className={td}>{fcfa(p.claude)}</td>
                <td className={td}>{fcfa(p.paymentFees)}</td>
                <td className={td}>
                  {p.planId === "free" ? (
                    <span>Acquisition cost {fcfa(p.claude)}</span>
                  ) : p.margin === null ? (
                    "—"
                  ) : (
                    <StatusBadge tone={p.flagged ? "red" : "green"}>{pct(p.margin)}</StatusBadge>
                  )}
                </td>
                <td className={td}>{int(p.aiConversations)}</td>
                <td className={td}>{fcfa(p.metaEstimate)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel
        id="businesses"
        title="By business"
        description={`${int(active.length)} with activity or revenue this month (of ${int(report.businesses.length)}). ${flagged.length ? `${int(flagged.length)} below target.` : "None below target."}`}
      >
        <TableWrap>
          <thead>
            <tr>
              {["Business", "Plan", "Revenue", "Claude (test chat)", "Budget", "Fees", "Margin", "AI conv.", "Claude / conv.", "WhatsApp service · utility · marketing", "Meta (est.)"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((b) => (
              <tr key={b.businessId} data-business-id={b.businessId} className={b.flagged ? "bg-coral-50/60" : undefined}>
                <td className={cn(td, "font-semibold")}>{b.name}</td>
                <td className={cn(td, "capitalize")}>
                  {b.planId}
                  {b.status && b.status !== "active" ? <span className="block text-xs text-slate">{b.status}</span> : null}
                </td>
                <td className={td}>{fcfa(b.revenue)}</td>
                <td className={td}>
                  {fcfa(b.claude)}
                  {b.claudeTest ? <span className="block text-xs text-slate">test chat {fcfa(b.claudeTest)}</span> : null}
                </td>
                <td className={td}>
                  {b.overBudget ? <StatusBadge tone="red">over {fcfa(b.budget)}</StatusBadge> : fcfa(b.budget)}
                </td>
                <td className={td}>{fcfa(b.paymentFees)}</td>
                <td className={td}>
                  {b.margin === null ? (b.flagged ? <StatusBadge tone="red">no revenue</StatusBadge> : "—") : <StatusBadge tone={b.flagged ? "red" : "green"}>{pct(b.margin)}</StatusBadge>}
                </td>
                <td className={td}>{int(b.aiConversations)}</td>
                <td className={td}>{b.claudePerConversation === null ? "—" : fcfa(b.claudePerConversation)}</td>
                <td className={td}>
                  {int(b.whatsapp.service)} · {int(b.whatsapp.utility)} · {int(b.whatsapp.marketing)}
                  {b.whatsapp.serviceOverFree ? <span className="block text-xs text-slate">{int(b.whatsapp.serviceOverFree)} service over the free {int(META_PRICING.freeServicePerNumberPerMonth)}</span> : null}
                </td>
                <td className={td}>{fcfa(b.metaEstimate)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      <p className="text-xs text-slate">
        Meta rates ({META_PRICING.market}, from {META_PRICING.effectiveFrom}): service and utility ${META_PRICING.ratesUsd.service}, marketing ${META_PRICING.ratesUsd.marketing}
        {META_PRICING.verified ? "" : " — unverified, to be confirmed on Meta's rate card"}. Claude cost is logged per request from this month&apos;s data onwards (earlier replies were not costed).
      </p>
    </main>
  );
}
