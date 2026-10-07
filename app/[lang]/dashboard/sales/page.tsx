import Link from "next/link";
import { Plus, Receipt, Search } from "lucide-react";

import { EmptyState, PageHeader, Pagination, Panel, StatusBadge, TableWrap, buttonLink, formatDate, formatMoney, param, paymentStatusTone, secondaryLink, td, th, withQuery } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { PAGE_SIZE, listSales } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { PAYMENT_METHODS } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.sales.title);

const select = "h-10 rounded-xl border border-input bg-card px-3 text-sm text-deep";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Completed sales, newest first. Profit is shown to owners and admins only. */
export default async function SalesPage({ searchParams }: PageProps<"/[lang]/dashboard/sales">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/sales"));
  const d = t.dashboard;
  const s = d.sales;
  const methods = [...PAYMENT_METHODS, "credit"] as const;
  const filters = {
    q: param(sp.q),
    from: DATE.test(param(sp.from) ?? "") ? param(sp.from) : undefined,
    to: DATE.test(param(sp.to) ?? "") ? param(sp.to) : undefined,
    method: methods.find((m) => m === param(sp.method)),
    status: (["paid", "partial", "unpaid"] as const).find((m) => m === param(sp.status)),
    customer: param(sp.customer),
    page: Number(param(sp.page)) || 1,
  };
  const { rows, total, page } = await listSales(business.id, business.timezone, filters, hasRole(business.role, "admin"));
  const filtered = !!(filters.q || filters.from || filters.to || filters.method || filters.status || filters.customer);
  const base = localizePath(locale, "/dashboard/sales");
  const isAdmin = hasRole(business.role, "admin");
  const canSell = hasRole(business.role, "agent");
  const money = (v: number) => formatMoney(v, business.currency, locale);
  const newSale = canSell ? (
    <Link href={localizePath(locale, "/dashboard/sales/new")} className={buttonLink}>
      <Plus aria-hidden /> {s.new}
    </Link>
  ) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={s.title} description={s.description} actions={newSale} />

      {total === 0 && !filtered ? (
        <EmptyState icon={Receipt} title={s.empty.title} text={s.empty.text} action={newSale} />
      ) : (
        <Panel>
          <form method="get" action={base} className="mb-4 flex flex-wrap items-end gap-2" role="search">
            <label className="relative min-w-0 flex-1 basis-48">
              <span className="sr-only">{d.common.search}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
              <input name="q" defaultValue={filters.q} placeholder={s.searchPlaceholder} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate">
              {s.filters.from}
              <input type="date" name="from" defaultValue={filters.from} className={select} />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate">
              {s.filters.to}
              <input type="date" name="to" defaultValue={filters.to} className={select} />
            </label>
            <select name="method" defaultValue={filters.method ?? ""} aria-label={s.filters.method} className={select}>
              <option value="">
                {s.filters.method}: {d.common.all}
              </option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {d.payments.methods[m]}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={filters.status ?? ""} aria-label={s.filters.status} className={select}>
              <option value="">
                {s.filters.status}: {d.common.all}
              </option>
              {(["paid", "partial", "unpaid"] as const).map((m) => (
                <option key={m} value={m}>
                  {d.orders.payment[m]}
                </option>
              ))}
            </select>
            <button type="submit" className={secondaryLink}>
              {d.common.filter}
            </button>
            {filtered ? (
              <Link href={base} className="px-2 text-sm font-semibold text-slate hover:underline">
                {d.common.clear}
              </Link>
            ) : null}
          </form>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate">{s.noResults}</p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  {[s.columns.receipt, s.columns.date, s.columns.customer, s.columns.items, s.columns.total, s.columns.method, s.columns.status, s.columns.staff, ...(isAdmin ? [s.columns.profit] : [])].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-mint/30" data-sale={r.order_number}>
                    <td className={td}>
                      <Link href={localizePath(locale, `/dashboard/sales/${r.id}`)} className="font-semibold text-waza-700 hover:underline">
                        {r.order_number}
                      </Link>
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(r.created_at, locale, true)}</td>
                    <td className={td}>{r.customers ? r.customers.name || `+${r.customers.whatsapp_phone}` : <span className="text-slate">{s.walkIn}</span>}</td>
                    <td className={`${td} text-slate`}>{format(s.itemsCount, { count: formatNumber(r.items, locale) })}</td>
                    <td className={`${td} font-semibold whitespace-nowrap`}>{money(Number(r.total))}</td>
                    <td className={td}>{r.payment_method ? (d.payments.methods[r.payment_method as keyof typeof d.payments.methods] ?? r.payment_method) : "—"}</td>
                    <td className={td}>
                      <StatusBadge tone={paymentStatusTone[r.payment_status]}>{d.orders.payment[r.payment_status as keyof typeof d.orders.payment] ?? r.payment_status}</StatusBadge>
                    </td>
                    <td className={`${td} text-slate`}>{r.staff ?? "—"}</td>
                    {isAdmin ? <td className={`${td} whitespace-nowrap`}>{r.profit === null ? <span className="text-xs text-slate">{s.costMissing}</span> : money(r.profit)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} labels={d.common} hrefFor={(n) => withQuery(base, { ...filters, page: n })} />
        </Panel>
      )}
    </div>
  );
}
