import { Bot, ChartColumn, Coins, Hand, MessagesSquare, ShoppingBag, Users } from "lucide-react";

import { PageHeader, Panel, StatCard, formatMoney, formatPercent } from "@/components/app/ui";
import { requireBusiness } from "@/lib/auth/dal";
import { getAnalytics } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.analytics.title);

/** Horizontal bars from real counts; an empty list renders "No data yet". */
function Bars({ rows, noData }: { rows: { label: string; value: number; display?: string }[]; noData: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max === 0) return <p className="py-6 text-center text-sm text-slate">{noData}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-deep">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface">
            <span className="block h-full rounded-full bg-waza-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold text-deep">{r.display ?? r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AnalyticsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/analytics"));
  const a = await getAnalytics(business.id, business.currency);
  const d = t.dashboard;
  const s = d.analytics;
  const n = (v: number) => formatNumber(v, locale);
  const noData = d.common.noDataYet;
  const cards = [
    { label: s.cards.conversations, value: n(a.totals.conversations), icon: MessagesSquare },
    { label: s.cards.customers, value: n(a.totals.customers), icon: Users },
    { label: s.cards.orders, value: n(a.totals.orders), icon: ShoppingBag },
    { label: s.cards.revenue, value: a.totals.orders ? formatMoney(a.totals.revenue, a.totals.currency, locale) : null, icon: Coins },
    { label: s.cards.aiResolution, value: a.totals.aiResolutionRate === null ? null : formatPercent(a.totals.aiResolutionRate, locale), icon: Bot },
    { label: s.cards.humanHandovers, value: n(a.totals.humanHandovers), icon: Hand },
  ];
  const lang = (code: string) => (code === "unknown" ? s.unknownLanguage : languageName(code as "en", locale));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={s.title} description={`${s.description} ${s.period}.`} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label}>
            <StatCard {...c} noData={noData} />
          </li>
        ))}
      </ul>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={s.conversationsByStatus}>
          <Bars
            noData={noData}
            rows={Object.entries(a.conversationsByStatus).map(([k, v]) => ({ label: d.conversations.statuses[k as keyof typeof d.conversations.statuses] ?? k, value: v, display: n(v) }))}
          />
        </Panel>
        <Panel title={s.ordersByStatus}>
          <Bars noData={noData} rows={Object.entries(a.ordersByStatus).map(([k, v]) => ({ label: d.orders.statuses[k as keyof typeof d.orders.statuses] ?? k, value: v, display: n(v) }))} />
        </Panel>
        <Panel title={s.topProducts}>
          <Bars noData={noData} rows={a.topOrderedProducts.map((p) => ({ label: p.name, value: p.quantity, display: format(s.units, { count: n(p.quantity) }) }))} />
        </Panel>
        <Panel title={s.mostAsked}>
          <div className="flex flex-col items-center py-6 text-center">
            <ChartColumn className="size-8 text-line-strong" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-slate">{noData}</p>
            <p className="mt-1 text-xs text-slate">{s.mostAskedNote}</p>
          </div>
        </Panel>
        <Panel title={s.customerLanguages}>
          <Bars noData={noData} rows={a.customerLanguages.map((l) => ({ label: lang(l.language), value: l.count, display: n(l.count) }))} />
        </Panel>
        <Panel title={s.messageLanguages}>
          <Bars noData={noData} rows={a.messageLanguages.map((l) => ({ label: lang(l.language), value: l.count, display: n(l.count) }))} />
        </Panel>
      </div>
    </div>
  );
}
