import Link from "next/link";
import { AlertTriangle, Banknote, HandCoins, Package, ShoppingCart, TrendingUp } from "lucide-react";

import { BarChart } from "@/components/app/bar-chart";
import { Panel, StatCard, StatusBadge, formatDate, formatMoney, paymentStatusTone } from "@/components/app/ui";
import type { Overview } from "@/lib/data/reports";
import { format, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { Messages } from "@/messages/en";

type Sale = { id: string; order_number: string; created_at: string; total: number | string; payment_status: string; customers: { name: string | null; whatsapp_phone: string } | null };

/** Sales, money, stock and customers at a glance (the top of the dashboard home). */
export function BusinessOverview({
  overview: o,
  recent,
  currency,
  locale,
  t,
  showProfit,
  canSell,
}: {
  overview: Overview;
  recent: Sale[];
  currency: string;
  locale: Locale;
  t: Messages["dashboard"];
  showProfit: boolean;
  canSell: boolean;
}) {
  const b = t.home.biz;
  const money = (v: number | string) => formatMoney(v, currency, locale);
  const n = (v: number) => formatNumber(v, locale);
  const href = (p: string) => localizePath(locale, p);
  const dayLabel = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const missingCost = o.month.itemsWithoutCost > 0;
  const link = "text-sm font-semibold text-waza-700 hover:underline";

  const alerts = [
    o.customers.owing ? { key: "owe", text: format(b.alertOwe, { count: n(o.customers.owing), amount: money(o.customers.outstanding) }), href: "/dashboard/customers?balance=1" } : null,
    o.stock.alertCount ? { key: "stock", text: format(b.alertStock, { count: n(o.stock.alertCount) }), href: "/dashboard/products" } : null,
    showProfit && missingCost ? { key: "cost", text: b.alertCost, href: "/dashboard/products" } : null,
  ].filter((a) => a !== null);

  return (
    <section aria-labelledby="business-title" className="flex flex-col gap-6" data-testid="business-overview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="business-title" className="type-h3">
          {b.title}
        </h2>
        {canSell ? (
          <Link href={href("/dashboard/sales/new")} className="inline-flex h-10 items-center gap-2 rounded-full bg-waza-500 px-5 text-sm font-semibold text-deep hover:bg-waza-400">
            <ShoppingCart className="size-4" aria-hidden /> {b.newSale}
          </Link>
        ) : null}
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li data-testid="today-sales">
          <StatCard label={b.todaySales} value={money(o.today.revenue)} icon={TrendingUp} hint={format(b.salesCount, { count: n(o.today.sales) })} noData="—" />
        </li>
        <li data-testid="today-received">
          <StatCard label={b.received} value={money(o.today.received)} icon={Banknote} hint={b.receivedHint} noData="—" />
        </li>
        {showProfit ? (
          <li data-testid="today-profit">
            <StatCard
              label={b.todayProfit}
              value={o.today.profit === null ? null : money(o.today.profit)}
              icon={TrendingUp}
              hint={o.today.itemsWithoutCost ? format(b.profitMissing, { count: n(o.today.itemsWithoutCost) }) : b.profitHint}
              noData="—"
            />
          </li>
        ) : null}
        <li data-testid="outstanding-credit">
          <StatCard label={b.outstanding} value={money(o.customers.outstanding)} icon={HandCoins} hint={format(b.outstandingHint, { count: n(o.customers.owing) })} noData="—" />
        </li>
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { key: "week", title: b.week, p: o.week, extra: null },
          { key: "month", title: b.month, p: o.month, extra: o.month },
        ].map(({ key, title, p, extra }) => (
          <div key={key} className="rounded-2xl border border-border bg-card p-5 shadow-card" data-testid={`period-${key}`}>
            <p className="text-sm text-slate">{title}</p>
            <p className="mt-1 font-display text-2xl font-bold text-deep">{money(p.revenue)}</p>
            <p className="text-xs text-slate">{format(b.salesCount, { count: n(p.sales) })}</p>
            {showProfit && p.profit !== null ? (
              <ul className="mt-2 space-y-0.5 text-sm">
                <li>{format(b.profit, { amount: money(p.profit) })}</li>
                {extra && extra.expenses !== null ? <li className="text-slate">{format(b.expenses, { amount: money(extra.expenses) })}</li> : null}
                {extra && extra.netProfit !== null ? <li className="font-semibold">{format(b.net, { amount: money(extra.netProfit) })}</li> : null}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title={b.trend}>
          {o.trend.some((d) => d.revenue > 0) ? (
            <BarChart
              testId="sales-trend"
              data={o.trend.map((d) => ({ key: d.day, label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)), value: d.revenue, detail: format(b.salesCount, { count: n(d.sales) }) }))}
              caption={b.trend}
              columns={[b.trendDay, b.trendRevenue]}
              format={money}
              label={(i) => i % 7 === 1 || i === o.trend.length - 1}
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate">{b.trendEmpty}</p>
          )}
        </Panel>
        <Panel title={b.bestSellers}>
          {o.bestSellers.length ? (
            <ol className="divide-y divide-border" data-testid="best-sellers">
              {o.bestSellers.map((p, i) => (
                <li key={p.productId ?? p.name} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-4 text-slate">{i + 1}</span>
                  {p.productId ? (
                    <Link href={href(`/dashboard/products/${p.productId}`)} className="min-w-0 flex-1 truncate py-1.5 font-semibold hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  )}
                  <span className="whitespace-nowrap text-slate">{format(b.sold, { count: n(p.quantity) })}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate">{b.noBestSellers}</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title={b.stock} actions={<Link href={href("/dashboard/products")} className={link}>{b.viewAll}</Link>}>
          <dl className="grid grid-cols-3 gap-2 text-center" data-testid="stock-stats">
            {[
              { label: b.products, value: o.stock.products, tone: "" },
              { label: b.low, value: o.stock.low, tone: o.stock.low ? "text-gold-800" : "" },
              { label: b.out, value: o.stock.out, tone: o.stock.out ? "text-coral-700" : "" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface p-2">
                <dt className="text-xs text-slate">{s.label}</dt>
                <dd className={`font-display text-xl font-bold ${s.tone}`}>{n(s.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex justify-between gap-2 text-sm">
            <span className="text-slate">{b.stockValue}</span>
            <span className="font-semibold">{money(o.stock.retailValue)}</span>
          </p>
          {o.stock.costValue !== null ? (
            <p className="mt-1 flex justify-between gap-2 text-sm">
              <span className="text-slate">{b.stockCost}</span>
              <span className="font-semibold">{money(o.stock.costValue)}</span>
            </p>
          ) : null}
        </Panel>
        <Panel title={b.customers} actions={<Link href={href("/dashboard/customers")} className={link}>{b.viewAll}</Link>}>
          <dl className="grid grid-cols-3 gap-2 text-center" data-testid="customer-stats">
            {[
              { label: b.totalCustomers, value: o.customers.total },
              { label: b.newCustomers, value: o.customers.newThisMonth },
              { label: b.owing, value: o.customers.owing },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface p-2">
                <dt className="text-xs text-slate">{s.label}</dt>
                <dd className="font-display text-xl font-bold">{n(s.value)}</dd>
              </div>
            ))}
          </dl>
          {o.customers.topOwing.length ? (
            <ul className="mt-3 divide-y divide-border">
              {o.customers.topOwing.slice(0, 3).map((c) => (
                <li key={c.id}>
                  <Link href={href(`/dashboard/customers/${c.id}`)} className="flex justify-between gap-2 py-2 text-sm hover:underline">
                    <span className="truncate">{c.name}</span>
                    <span className="font-semibold whitespace-nowrap text-gold-800">{money(c.outstanding)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
        <Panel title={b.alerts}>
          {alerts.length ? (
            <ul className="flex flex-col gap-2" data-testid="business-alerts">
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link href={href(a.href)} className="flex gap-2 rounded-xl bg-gold-50 p-3 text-sm text-deep hover:bg-gold-100">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-800" aria-hidden />
                    <span>{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">{b.noAlerts}</p>
          )}
        </Panel>
      </div>

      <Panel title={b.recent} actions={<Link href={href("/dashboard/sales")} className={link}>{b.viewAll}</Link>}>
        {recent.length ? (
          <ul className="divide-y divide-border" data-testid="recent-sales">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={href(`/dashboard/sales/${s.id}`)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:bg-mint/30">
                  <Package className="size-4 shrink-0 text-slate" aria-hidden />
                  <span className="font-semibold">{s.order_number}</span>
                  <span className="min-w-0 flex-1 truncate text-slate">{s.customers ? s.customers.name || `+${s.customers.whatsapp_phone}` : t.sales.walkIn}</span>
                  <span className="whitespace-nowrap text-slate">{formatDate(s.created_at, locale, true)}</span>
                  <span className="font-semibold whitespace-nowrap">{money(s.total)}</span>
                  <StatusBadge tone={paymentStatusTone[s.payment_status]}>{t.orders.payment[s.payment_status as keyof typeof t.orders.payment] ?? s.payment_status}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">{b.noRecent}</p>
        )}
      </Panel>
      {showProfit ? <p className="-mt-3 text-xs text-slate">{b.estimated}</p> : null}
    </section>
  );
}
