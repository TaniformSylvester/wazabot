import Link from "next/link";
import { Download } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { BarChart } from "@/components/app/bar-chart";
import { ReportPeriodForm } from "@/components/app/report-period-form";
import { PageHeader, Panel, StatusBadge, TableWrap, formatMoney, param, secondaryLink, td, th, withQuery } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { REPORT_GROUPS, REPORT_RANGES, addDays, getReport, groupDays, resolvePeriod } from "@/lib/data/reports";
import { getPlanLimits, profitAllowed, reportDaysAllowed } from "@/lib/data/queries";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.reports.title);

const field = "h-10 rounded-xl border border-input bg-card px-3 text-sm text-deep";

/** Reports for a period (owners and admins: they include costs and profit). */
export default async function ReportsPage({ searchParams }: PageProps<"/[lang]/dashboard/reports">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/reports"));
  const d = t.dashboard;
  const r = d.reports;
  if (!hasRole(business.role, "admin")) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader title={r.title} description={r.description} />
        <FormAlert tone="info">{r.adminOnly}</FormAlert>
      </div>
    );
  }
  const period = resolvePeriod(business.timezone, { range: param(sp.range), from: param(sp.from), to: param(sp.to), group: param(sp.group) });
  // Free plan: the last few days only, and no costs or profit.
  const limits = await getPlanLimits(business.id);
  const withProfit = profitAllowed(limits);
  const maxDays = reportDaysAllowed(limits);
  if (maxDays) {
    const earliest = addDays(period.today, -(maxDays - 1));
    if (period.from < earliest) period.from = earliest;
    if (period.to < earliest) period.to = period.today;
  }
  const data = await getReport(business.id, business.timezone, period.from, period.to);
  const money = (v: number) => formatMoney(v, business.currency, locale);
  const n = (v: number) => formatNumber(v, locale);
  const intl = locale === "fr" ? "fr-FR" : "en-GB";
  const dayFmt = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const monthFmt = new Intl.DateTimeFormat(intl, { month: "long", year: "numeric", timeZone: "UTC" });
  const asDate = (s: string) => new Date(`${s.length === 7 ? `${s}-01` : s}T00:00:00Z`);
  const periodLabel = (day: string) =>
    period.group === "month" ? monthFmt.format(asDate(day)) : period.group === "week" ? format(r.sales.weekOf, { date: dayFmt.format(asDate(day)) }) : dayFmt.format(asDate(day));
  const grouped = groupDays(data.days, period.group);
  const tot = data.totals;
  const csv = (type: string) => withQuery(localizePath(locale, "/dashboard/reports/export"), { type, from: period.from, to: period.to, group: period.group });
  const csvLink = (type: string) => (
    <a href={csv(type)} className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-waza-700 hover:underline" download>
      <Download className="size-4" aria-hidden /> {r.csv}
    </a>
  );
  const catLabel = (c: string) => d.expenses.categories[c as keyof typeof d.expenses.categories] ?? c;
  const top = (key: "quantity" | "revenue" | "profit") => [...data.products].sort((a, b) => b[key] - a[key]).slice(0, 10);

  const summary = [
    { key: "sales", label: r.summary.sales, value: n(tot.sales) },
    { key: "revenue", label: r.summary.revenue, value: money(tot.revenue) },
    ...(withProfit
      ? [
          { key: "cogs", label: r.summary.cogs, value: money(tot.cogs) },
          { key: "gross", label: r.summary.gross, value: money(tot.grossProfit) },
          { key: "expenses", label: r.summary.expenses, value: money(tot.expenses) },
          { key: "net", label: r.summary.net, value: money(tot.netProfit), strong: true },
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={r.title} description={r.description} />

      <Panel>
        <ReportPeriodForm action={localizePath(locale, "/dashboard/reports")}>
          <label className="flex flex-col gap-1 text-sm text-slate">
            {r.period}
            <select name="range" defaultValue={period.range} className={field}>
              {REPORT_RANGES.map((k) => (
                <option key={k} value={k}>
                  {r.ranges[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate">
            {r.from}
            <input type="date" name="from" defaultValue={period.from} max={period.today} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate">
            {r.to}
            <input type="date" name="to" defaultValue={period.to} max={period.today} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate">
            {r.groupBy}
            <select name="group" defaultValue={period.group} className={field}>
              {REPORT_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {r.groups[g]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={secondaryLink}>
            {r.apply}
          </button>
        </ReportPeriodForm>
        <p className="mt-3 text-sm font-semibold text-deep" data-testid="report-period">
          {dayFmt.format(asDate(period.from))} – {dayFmt.format(asDate(period.to))}
        </p>
      </Panel>

      {maxDays || !withProfit ? (
        <PlanUpsell text={maxDays ? format(d.plan.reportsLimited, { days: n(maxDays) }) : d.plan.profitLocked} cta={d.plan.upgrade} locale={locale} compact />
      ) : null}

      <section aria-label={r.summary.revenue}>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3" data-testid="report-summary">
          {summary.map((s) => (
            <div key={s.key} className="rounded-2xl border border-border bg-card p-4 shadow-card" data-summary={s.key}>
              <dt className="text-sm text-slate">{s.label}</dt>
              <dd className={`mt-1 font-display text-2xl font-bold ${s.strong ? (tot.netProfit < 0 ? "text-coral-700" : "text-waza-700") : "text-deep"}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-slate">
          {withProfit ? r.estimated : null}
          {tot.discounts > 0 ? ` ${r.summary.discounts}: ${money(tot.discounts)}.` : ""}
        </p>
        {withProfit && tot.itemsWithoutCost > 0 ? (
          <div className="mt-3">
            <FormAlert tone="info">{format(r.missingCost, { count: n(tot.itemsWithoutCost) })}</FormAlert>
          </div>
        ) : null}
      </section>

      <Panel title={r.sales.title} actions={csvLink("sales")}>
        {grouped.length ? (
          <>
            {grouped.length > 1 ? (
              <div className="mb-4">
                <BarChart
                  data={grouped.map((g) => ({ key: g.day, label: periodLabel(g.day), value: g.revenue }))}
                  caption={r.sales.title}
                  columns={[r.sales.period, r.sales.revenue]}
                  format={money}
                  label={(i) => grouped.length <= 12 || i % Math.ceil(grouped.length / 6) === 0}
                />
              </div>
            ) : null}
            <TableWrap>
              <thead>
                <tr>
                  {[r.sales.period, r.sales.sales, r.sales.revenue, ...(withProfit ? [r.sales.cogs, r.sales.profit] : [])].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody data-testid="report-sales">
                {grouped.map((g) => (
                  <tr key={g.day}>
                    <td className={`${td} whitespace-nowrap`}>{periodLabel(g.day)}</td>
                    <td className={td}>{n(g.sales)}</td>
                    <td className={`${td} whitespace-nowrap`}>{money(g.revenue)}</td>
                    {withProfit ? <td className={`${td} whitespace-nowrap text-slate`}>{money(g.cogs)}</td> : null}
                    {withProfit ? <td className={`${td} font-semibold whitespace-nowrap`}>{money(g.revenue - g.cogs)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </>
        ) : (
          <p className="text-sm text-slate">{r.sales.empty}</p>
        )}
      </Panel>

      <Panel title={r.products.title} actions={csvLink("products")}>
        {data.products.length ? (
          <div className="grid gap-6 lg:grid-cols-3" data-testid="report-products">
            {(
              [
                ["quantity", r.products.bestSelling, (p: (typeof data.products)[number]) => n(p.quantity)],
                ["revenue", r.products.topRevenue, (p: (typeof data.products)[number]) => money(p.revenue)],
                ["profit", r.products.topProfit, (p: (typeof data.products)[number]) => money(p.profit)],
              ] as const
            )
              .filter(([key]) => withProfit || key !== "profit")
              .map(([key, title, value]) => (
              <div key={key}>
                <h3 className="mb-2 text-sm font-semibold text-deep">{title}</h3>
                <ol className="divide-y divide-border text-sm">
                  {top(key).map((p, i) => (
                    <li key={`${p.productId ?? p.name}-${i}`} className="flex gap-2 py-1.5">
                      <span className="w-4 text-slate">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="font-semibold whitespace-nowrap">{value(p)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate">{r.products.empty}</p>
        )}
        <h3 className="mt-6 mb-2 text-sm font-semibold text-deep">{r.products.lowStock}</h3>
        {data.stock.alerts.length ? (
          <ul className="flex flex-wrap gap-2">
            {data.stock.alerts.map((a) => (
              <li key={`${a.productId}-${a.variant ?? ""}`}>
                <Link href={localizePath(locale, `/dashboard/products/${a.productId}`)} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm hover:bg-mint/40">
                  {a.name}
                  {a.variant ? <span className="text-slate">({a.variant})</span> : null}
                  <StatusBadge tone={a.out ? "red" : "amber"}>{a.out ? r.products.out : format(r.products.left, { count: n(a.quantity) })}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">{r.products.noLowStock}</p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={r.customers.top} actions={csvLink("customers")}>
          {data.customers.length ? (
            <ol className="divide-y divide-border text-sm" data-testid="report-customers">
              {data.customers.map((c, i) => (
                <li key={c.id}>
                  <Link href={localizePath(locale, `/dashboard/customers/${c.id}`)} className="flex gap-2 py-2 hover:underline">
                    <span className="w-4 text-slate">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-slate">{n(c.sales)}</span>
                    <span className="font-semibold whitespace-nowrap">{money(c.spent)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate">{r.customers.empty}</p>
          )}
        </Panel>
        <Panel title={r.customers.owing} description={data.owing.count ? `${n(data.owing.count)} · ${money(data.owing.total)}` : undefined}>
          {data.owing.top.length ? (
            <ol className="divide-y divide-border text-sm" data-testid="report-owing">
              {data.owing.top.map((c) => (
                <li key={c.id}>
                  <Link href={localizePath(locale, `/dashboard/customers/${c.id}`)} className="flex gap-2 py-2 hover:underline">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="font-semibold whitespace-nowrap text-gold-800">{money(c.outstanding)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate">{r.customers.noneOwing}</p>
          )}
        </Panel>
      </div>

      {withProfit ? (
        <Panel title={r.expenses.title} actions={csvLink("expenses")}>
        {data.expenses.length ? (
          <div className="grid gap-6 lg:grid-cols-2" data-testid="report-expenses">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-deep">{r.expenses.byCategory}</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {data.expensesByCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between gap-2">
                      <span>{catLabel(c.category)}</span>
                      <span className="font-semibold">{money(c.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface">
                      <div className="h-1.5 rounded-full bg-waza-600" style={{ width: `${Math.max(2, Math.round((c.amount / tot.expenses) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-deep">{r.expenses.overTime}</h3>
              <ul className="divide-y divide-border text-sm">
                {data.expensesByMonth.map((m) => (
                  <li key={m.month} className="flex justify-between gap-2 py-1.5">
                    <span>{monthFmt.format(asDate(m.month))}</span>
                    <span className="font-semibold">{money(m.amount)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 py-1.5 font-semibold">
                  <span>{r.expenses.total}</span>
                  <span>{money(tot.expenses)}</span>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate">{r.expenses.empty}</p>
        )}
        </Panel>
      ) : null}
    </div>
  );
}
