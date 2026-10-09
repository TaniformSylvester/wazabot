import Link from "next/link";
import { ArrowRight, CircleDollarSign, HandCoins, Plus, Receipt, Search, ShoppingBag, Wallet } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import {
  EmptyState,
  PageHeader,
  Pagination,
  Panel,
  StatCard,
  StatusBadge,
  TableWrap,
  buttonLink,
  formatDate,
  formatMoney,
  orderStatusTone,
  param,
  paymentStatusTone,
  secondaryLink,
  td,
  th,
  withQuery,
} from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { ORDER_SUMMARY_CAP, PAGE_SIZE, getCustomer, listOrders } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.orders.title);

export default async function OrdersPage({ searchParams }: PageProps<"/[lang]/dashboard/orders">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/orders"));
  const d = t.dashboard;
  const o = d.orders;
  const filters = {
    q: param(sp.q),
    status: param(sp.status),
    payment: param(sp.payment),
    from: param(sp.from),
    to: param(sp.to),
    customer: param(sp.customer),
    balance: param(sp.balance) === "1" ? "1" : undefined,
    page: Number(param(sp.page)) || 1,
  };
  const [{ rows, total, page, summary }, customerFilter] = await Promise.all([
    listOrders(business.id, business.timezone, { ...filters, balance: !!filters.balance }),
    filters.customer && /^[0-9a-f-]{36}$/i.test(filters.customer) ? getCustomer(business.id, filters.customer) : null,
  ]);
  const canCreate = hasRole(business.role, "agent");
  const base = localizePath(locale, "/dashboard/orders");
  const filtered = !!(filters.q || filters.status || filters.payment || filters.from || filters.to || filters.customer || filters.balance);
  const money = (v: number | string) => formatMoney(v, business.currency, locale);
  const input = "h-10 rounded-xl border border-input bg-card px-3 text-sm";
  const newLink = canCreate ? (
    <Link href={localizePath(locale, "/dashboard/orders/new")} className={buttonLink}>
      <Plus aria-hidden /> {o.new}
    </Link>
  ) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={o.title} description={o.description} actions={newLink} />
      {param(sp.deleted) ? <FormAlert tone="success">{o.deleted}</FormAlert> : null}
      {total === 0 && !filtered ? (
        <EmptyState icon={ShoppingBag} title={o.empty.title} text={o.empty.text} action={newLink} />
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="orders-summary">
          <StatCard label={o.summary.orders} value={formatNumber(summary.orders, locale)} icon={ShoppingBag} noData="—" />
          <StatCard label={o.summary.value} value={money(summary.value)} icon={Receipt} noData="—" />
          <StatCard label={o.summary.collected} value={money(summary.collected)} icon={Wallet} noData="—" />
          <StatCard label={o.summary.outstanding} value={money(summary.outstanding)} icon={HandCoins} noData="—" />
        </div>
        <p className="-mt-3 text-xs text-slate">
          {o.summary.note}
          {summary.capped ? ` ${format(o.summary.capped, { count: formatNumber(ORDER_SUMMARY_CAP, locale) })}` : ""}
        </p>
        <Panel>
          <form method="get" action={base} className="mb-4 flex flex-wrap gap-2" role="search">
            {filters.customer ? <input type="hidden" name="customer" value={filters.customer} /> : null}
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">{d.common.search}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
              <input name="q" defaultValue={filters.q} placeholder={o.searchPlaceholder} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
            </label>
            <select name="status" defaultValue={filters.status ?? ""} aria-label={o.columns.status} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">
                {o.columns.status}: {d.common.all}
              </option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {o.statuses[s]}
                </option>
              ))}
            </select>
            <select name="payment" defaultValue={filters.payment ?? ""} aria-label={o.columns.payment} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">
                {o.columns.payment}: {d.common.all}
              </option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {o.payment[s]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate">
              {o.filters.from}
              <input type="date" name="from" defaultValue={filters.from} className={input} />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate">
              {o.filters.to}
              <input type="date" name="to" defaultValue={filters.to} className={input} />
            </label>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm">
              <input type="checkbox" name="balance" value="1" defaultChecked={!!filters.balance} className="size-4 accent-waza-600" />
              {o.filters.withBalance}
            </label>
            <button type="submit" className={secondaryLink}>
              {d.common.filter}
            </button>
            {filtered ? (
              <Link href={base} className="self-center px-2 text-sm font-semibold text-slate hover:underline">
                {d.common.clear}
              </Link>
            ) : null}
          </form>
          {customerFilter ? (
            <p className="mb-3 text-sm text-slate" data-testid="orders-customer-filter">
              {o.filters.customer}:{" "}
              <Link href={localizePath(locale, `/dashboard/customers/${customerFilter.customer.id}`)} className="font-semibold text-deep hover:underline">
                {customerFilter.customer.name || d.customers.unnamed} ({customerFilter.customer.reference})
              </Link>
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate">{o.noResults}</p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>{o.columns.number}</th>
                  <th className={th}>{o.columns.customer}</th>
                  <th className={th}>{o.columns.status}</th>
                  <th className={th}>{o.columns.payment}</th>
                  <th className={`${th} text-right`}>{o.columns.total}</th>
                  <th className={`${th} text-right`}>{o.columns.balance}</th>
                  <th className={th}>{o.columns.date}</th>
                  <th className={th}>
                    <span className="sr-only">{o.columns.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-mint/30">
                    <td className={td}>
                      <Link href={localizePath(locale, `/dashboard/orders/${r.id}`)} className="font-semibold whitespace-nowrap hover:underline">
                        {r.order_number}
                      </Link>
                    </td>
                    <td className={td} data-testid="order-customer">
                      {r.customers ? (
                        <>
                          <span className="block font-medium text-deep">{r.customers.name || `+${r.customers.whatsapp_phone}`}</span>
                          <span className="block font-mono text-xs text-slate">{r.customers.reference}</span>
                        </>
                      ) : (
                        <span className="text-slate italic">{r.channel === "pos" ? o.walkIn : o.notLinked}</span>
                      )}
                    </td>
                    <td className={td}>
                      <StatusBadge tone={orderStatusTone[r.status]}>{o.statuses[r.status as keyof typeof o.statuses] ?? r.status}</StatusBadge>
                    </td>
                    <td className={td}>
                      <StatusBadge tone={paymentStatusTone[r.payment_status]}>{o.payment[r.payment_status as keyof typeof o.payment] ?? r.payment_status}</StatusBadge>
                    </td>
                    <td className={`${td} text-right font-semibold whitespace-nowrap`}>{formatMoney(r.total, r.currency, locale)}</td>
                    <td className={`${td} text-right whitespace-nowrap`} data-testid="order-balance">
                      {Number(r.balance_due ?? 0) > 0 ? <span className="font-semibold text-gold-800">{money(Number(r.balance_due))}</span> : <span className="text-slate">—</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(r.created_at, locale)}</td>
                    <td className={`${td} text-right`}>
                      <Link href={localizePath(locale, `/dashboard/orders/${r.id}`)} className="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-waza-700 hover:underline">
                        {o.view} <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} labels={d.common} hrefFor={(n) => withQuery(base, { ...filters, page: n })} />
        </Panel>
        </>
      )}
    </div>
  );
}
