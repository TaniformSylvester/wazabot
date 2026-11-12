import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, ChefHat, HandCoins, LayoutGrid, MessagesSquare, PackageX, ShoppingCart, Truck, UtensilsCrossed } from "lucide-react";

import { SalesExpensesChart } from "@/components/app/sales-expenses-chart";
import { Panel, StatCard, formatDate, formatMoney } from "@/components/app/ui";
import { type Locale } from "@/lib/i18n/config";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

type D = Messages["dashboard"];

/** A call to action at the top of the dashboard: what needs doing now, with the page that does it. */
export type Attention = { key: string; text: string; cta: string; href: string; icon: typeof AlertTriangle; tone: "gold" | "coral" | "blue" };

export function AttentionBanners({ items, label, locale }: { items: Attention[]; label: string; locale: Locale }) {
  if (!items.length) return null;
  const tones = {
    gold: "border-gold-200 bg-gold-50 text-gold-800",
    coral: "border-coral-200 bg-coral-50 text-coral-800",
    blue: "border-waza-100 bg-mint/60 text-deep",
  };
  return (
    <section aria-label={label} className="flex flex-col gap-2" data-testid="attention">
      {items.map(({ key, text, cta, href, icon: Icon, tone }) => (
        <div key={key} role="status" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 text-sm", tones[tone])} data-testid={`attention-${key}`}>
          <Icon className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 font-medium">{text}</p>
          <Link href={localizePath(locale, href)} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            {cta} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ))}
    </section>
  );
}

type Shop = {
  today: { byMethod: { method: string; amount: number }[]; onCredit: number };
  toHandOver: { total: number; delivery: number; pickup: number };
  overdueCredit: { customers: number; amount: number; top: { id: string; name: string; amount: number; since: string }[] };
};

/** Shops: today by payment method (and on credit), orders to hand over, credit overdue for 30+ days, and the till. */
export function ShopToday({ shop, currency, locale, t, days, canSell }: { shop: Shop; currency: string; locale: Locale; t: D; days: number; canSell: boolean }) {
  const s = t.home.shop;
  const money = (v: number) => formatMoney(v, currency, locale);
  const n = (v: number) => formatNumber(v, locale);
  const method = (m: string) => t.payments.methods[m as keyof typeof t.payments.methods] ?? m;
  const link = "text-sm font-semibold text-waza-700 hover:underline";
  return (
    <div className="grid gap-6 lg:grid-cols-3" data-testid="shop-today">
      <Panel
        title={s.byMethod}
        actions={
          canSell ? (
            <Link href={localizePath(locale, "/dashboard/sales/new")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-waza-500 px-4 text-sm font-semibold text-deep hover:bg-waza-400" data-testid="quick-sale">
              <ShoppingCart className="size-4" aria-hidden /> {s.quickSale}
            </Link>
          ) : null
        }
      >
        {shop.today.byMethod.length || shop.today.onCredit ? (
          <ul className="divide-y divide-border text-sm" data-testid="by-method">
            {shop.today.byMethod.map((m) => (
              <li key={m.method} className="flex justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <Banknote className="size-4 text-slate" aria-hidden /> {method(m.method)}
                </span>
                <span className="font-semibold whitespace-nowrap">{money(m.amount)}</span>
              </li>
            ))}
            {shop.today.onCredit ? (
              <li className="flex justify-between gap-3 py-2 text-gold-800">
                <span className="flex items-center gap-2">
                  <HandCoins className="size-4" aria-hidden /> {s.onCredit}
                </span>
                <span className="font-semibold whitespace-nowrap">{money(shop.today.onCredit)}</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-sm text-slate">{s.noPayments}</p>
        )}
        <p className="mt-3 text-xs text-slate">{s.byMethodNote}</p>
      </Panel>
      <div data-testid="to-hand-over">
        <StatCard
          label={s.toHandOver}
          value={n(shop.toHandOver.total)}
          icon={Truck}
          hint={format(s.toHandOverHint, { delivery: n(shop.toHandOver.delivery), pickup: n(shop.toHandOver.pickup) })}
          noData="—"
        />
      </div>
      <Panel
        title={format(s.overdue, { days: n(days) })}
        description={format(s.overdueText, { days: n(days) })}
        actions={
          <Link href={localizePath(locale, "/dashboard/customers?balance=1")} className={link}>
            {s.seeAll}
          </Link>
        }
      >
        {shop.overdueCredit.top.length ? (
          <ul className="divide-y divide-border" data-testid="overdue-credit">
            {shop.overdueCredit.top.map((c) => (
              <li key={c.id}>
                <Link href={localizePath(locale, `/dashboard/customers/${c.id}`)} className="flex items-center justify-between gap-2 py-2 text-sm hover:underline">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block text-xs text-slate">{format(s.overdueSince, { date: formatDate(c.since, locale) })}</span>
                  </span>
                  <span className="font-semibold whitespace-nowrap text-coral-700">{money(c.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">{format(s.overdueNone, { days: n(days) })}</p>
        )}
      </Panel>
    </div>
  );
}

/** Sales against expenses, per day (30 days) or per week (12 weeks): Business and Multi-shop plans. */
export function SalesVsExpenses({
  trend,
  view,
  currency,
  locale,
  t,
}: {
  trend: { daily: { day: string; sales: number; expenses: number }[]; weekly: { week: string; sales: number; expenses: number }[] };
  view: "day" | "week";
  currency: string;
  locale: Locale;
  t: D;
}) {
  const tr = t.home.trend;
  const money = (v: number) => formatMoney(v, currency, locale);
  const dayLabel = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const rows =
    view === "week"
      ? trend.weekly.map((w) => ({ key: w.week, label: dayLabel.format(new Date(`${w.week}T00:00:00Z`)), sales: w.sales, expenses: w.expenses }))
      : trend.daily.map((d) => ({ key: d.day, label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)), sales: d.sales, expenses: d.expenses }));
  const tab = (v: "day" | "week", label: string) => (
    <Link
      href={localizePath(locale, v === "week" ? "/dashboard?trend=week#sales-expenses" : "/dashboard#sales-expenses")}
      aria-current={view === v ? "true" : undefined}
      className={cn("rounded-full px-3 py-1 text-xs font-semibold", view === v ? "bg-deep text-white" : "text-deep hover:bg-mint")}
    >
      {label}
    </Link>
  );
  return (
    <Panel
      id="sales-expenses"
      title={tr.title}
      actions={
        <span className="inline-flex gap-1 rounded-full border border-border p-0.5" data-testid="trend-switch">
          {tab("day", tr.daily)}
          {tab("week", tr.weekly)}
        </span>
      }
    >
      {rows.some((r) => r.sales || r.expenses) ? (
        <SalesExpensesChart
          testId="sales-expenses"
          data={view === "week" ? rows.map((r) => ({ ...r, label: r.label })) : rows}
          labels={{ caption: tr.title, period: tr.period, sales: tr.sales, expenses: tr.expenses, net: tr.net }}
          format={money}
          showLabel={(i) => (view === "week" ? i % 3 === 0 || i === rows.length - 1 : i % 7 === 1 || i === rows.length - 1)}
        />
      ) : (
        <p className="py-10 text-center text-sm text-slate">{tr.empty}</p>
      )}
      <p className="mt-3 text-xs text-slate">{tr.note}</p>
    </Panel>
  );
}

type FloorTable = { id: string; name: string; area: string | null; bill: { id: string; total: number; guests: number | null; readyRounds: number } | null };

/** Restaurants: open bills, today's turnover, the kitchen queue, every table's state, and the way to the floor and the kitchen screen. */
export function RestaurantToday({
  tables,
  openTotal,
  openCount,
  turnover,
  kitchen,
  maxKitchen,
  currency,
  locale,
  t,
}: {
  tables: FloorTable[];
  openTotal: number;
  openCount: number;
  turnover: number;
  kitchen: { new: number; preparing: number; ready: number } | null;
  maxKitchen: number;
  currency: string;
  locale: Locale;
  t: D;
}) {
  const r = t.home.restaurant;
  const money = (v: number) => formatMoney(v, currency, locale);
  const n = (v: number) => formatNumber(v, locale);
  const href = (p: string) => localizePath(locale, p);
  const link = "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-deep hover:bg-mint";
  return (
    <section aria-labelledby="restaurant-today-title" className="flex flex-col gap-4" data-testid="restaurant-today">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="restaurant-today-title" className="type-h3">
          {r.title}
        </h2>
        <span className="flex flex-wrap gap-2">
          <Link href={href("/dashboard/restaurant")} className={link}>
            <LayoutGrid className="size-4" aria-hidden /> {r.openFloor}
          </Link>
          <Link href={href("/dashboard/restaurant/kitchen")} className={link} data-testid="open-kitchen">
            <ChefHat className="size-4" aria-hidden /> {r.openKitchen}
          </Link>
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        <li data-testid="restaurant-open-bills">
          <StatCard label={r.openBills} value={n(openCount)} icon={UtensilsCrossed} hint={format(r.openBillsHint, { amount: money(openTotal) })} noData="—" />
        </li>
        <li data-testid="restaurant-turnover">
          <StatCard label={r.turnover} value={money(turnover)} icon={Banknote} hint={r.turnoverHint} noData="—" />
        </li>
        <li data-testid="restaurant-kitchen">
          <StatCard
            label={r.kitchen}
            value={kitchen ? n(kitchen.new + kitchen.preparing) : null}
            icon={ChefHat}
            hint={kitchen ? format(r.kitchenHint, { new: n(kitchen.new), preparing: n(kitchen.preparing), ready: n(kitchen.ready) }) : r.kitchenUnavailable}
            noData="—"
          />
        </li>
      </ul>
      <Panel title={r.tables}>
        {tables.length ? (
          <>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8" data-testid="table-grid">
              {tables.map((tb) => {
                const state = !tb.bill ? "free" : tb.bill.readyRounds ? "ready" : "occupied";
                return (
                  <li key={tb.id}>
                    <Link
                      href={href(tb.bill ? `/dashboard/restaurant/orders/${tb.bill.id}` : "/dashboard/restaurant")}
                      className={cn(
                        "flex h-full flex-col rounded-xl border p-2.5 text-sm transition-colors",
                        state === "free" && "border-border bg-card text-slate hover:bg-mint/40",
                        state === "occupied" && "border-gold-200 bg-gold-50 text-deep hover:bg-gold-100",
                        state === "ready" && "border-waza-500 bg-mint text-deep hover:bg-mint/70",
                      )}
                      data-state={state}
                    >
                      <span className="font-semibold text-deep">{tb.name}</span>
                      <span className="text-xs">{state === "free" ? r.free : state === "ready" ? r.ready : r.occupied}</span>
                      {tb.bill ? <span className="mt-1 text-xs font-semibold">{money(tb.bill.total)}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate" aria-hidden>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-border bg-card" /> {r.free}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-gold-200" /> {r.occupied}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-waza-500" /> {r.ready}</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-slate">{r.noTables}</p>
        )}
        <p className="mt-3 text-xs text-slate">{format(r.kitchenAccounts, { count: n(maxKitchen) })}</p>
      </Panel>
    </section>
  );
}

export const attentionIcons = { stock: PackageX, credit: HandCoins, chats: MessagesSquare, orders: Truck, bills: UtensilsCrossed, ready: ChefHat };
