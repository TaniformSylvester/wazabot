import Link from "next/link";
import { Plus, Search, ShoppingBag } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import {
  EmptyState,
  PageHeader,
  Pagination,
  Panel,
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
import { PAGE_SIZE, listOrders } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.orders.title);

export default async function OrdersPage({ searchParams }: PageProps<"/[lang]/dashboard/orders">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/orders"));
  const d = t.dashboard;
  const o = d.orders;
  const filters = { q: param(sp.q), status: param(sp.status), payment: param(sp.payment), page: Number(param(sp.page)) || 1 };
  const { rows, total, page } = await listOrders(business.id, filters);
  const canCreate = hasRole(business.role, "agent");
  const base = localizePath(locale, "/dashboard/orders");
  const filtered = !!(filters.q || filters.status || filters.payment);
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
        <Panel>
          <form method="get" action={base} className="mb-4 flex flex-wrap gap-2" role="search">
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
            <button type="submit" className={secondaryLink}>
              {d.common.filter}
            </button>
            {filtered ? (
              <Link href={base} className="self-center px-2 text-sm font-semibold text-slate hover:underline">
                {d.common.clear}
              </Link>
            ) : null}
          </form>
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
                  <th className={th}>{o.columns.date}</th>
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
                    <td className={td}>{r.customers?.name || `+${r.customers?.whatsapp_phone ?? ""}`}</td>
                    <td className={td}>
                      <StatusBadge tone={orderStatusTone[r.status]}>{o.statuses[r.status as keyof typeof o.statuses] ?? r.status}</StatusBadge>
                    </td>
                    <td className={td}>
                      <StatusBadge tone={paymentStatusTone[r.payment_status]}>{o.payment[r.payment_status as keyof typeof o.payment] ?? r.payment_status}</StatusBadge>
                    </td>
                    <td className={`${td} text-right font-semibold whitespace-nowrap`}>{formatMoney(r.total, r.currency, locale)}</td>
                    <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(r.created_at, locale)}</td>
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
