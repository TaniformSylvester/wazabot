import Link from "next/link";
import { Package, Plus, Search } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/app/form";
import { EmptyState, PageHeader, Pagination, Panel, StatusBadge, TableWrap, buttonLink, formatMoney, param, secondaryLink, td, th, withQuery } from "@/components/app/ui";
import { setProductActive } from "@/lib/actions/products";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { PAGE_SIZE, listProductCategories, listProducts } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.products.title);

const select = "h-10 rounded-xl border border-input bg-card px-3 text-sm text-deep";

export default async function ProductsPage({ searchParams }: PageProps<"/[lang]/dashboard/products">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/products"));
  const d = t.dashboard;
  const p = d.products;
  const filters = {
    q: param(sp.q),
    category: param(sp.category),
    status: (["active", "inactive"] as const).find((s) => s === param(sp.status)),
    stock: (["low", "out"] as const).find((s) => s === param(sp.stock)),
    page: Number(param(sp.page)) || 1,
  };
  const [{ rows, total, page }, categories] = await Promise.all([listProducts(business.id, filters), listProductCategories(business.id)]);
  const canEdit = canManageBusiness(business.role);
  const base = localizePath(locale, "/dashboard/products");
  const filtered = !!(filters.q || filters.category || filters.status || filters.stock);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={p.title}
        description={p.description}
        actions={
          canEdit ? (
            <Link href={localizePath(locale, "/dashboard/products/new")} className={buttonLink}>
              <Plus aria-hidden /> {p.new}
            </Link>
          ) : null
        }
      />
      {param(sp.deleted) ? <FormAlert tone="success">{p.deleted}</FormAlert> : null}

      {total === 0 && !filtered ? (
        <EmptyState
          icon={Package}
          title={p.empty.title}
          text={p.empty.text}
          action={
            canEdit ? (
              <Link href={localizePath(locale, "/dashboard/products/new")} className={buttonLink}>
                <Plus aria-hidden /> {p.new}
              </Link>
            ) : null
          }
        />
      ) : (
        <Panel>
          <form method="get" action={base} className="mb-4 flex flex-wrap items-end gap-2" role="search">
            <label className="relative min-w-0 flex-1 basis-60">
              <span className="sr-only">{d.common.search}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
              <input name="q" defaultValue={filters.q} placeholder={p.searchPlaceholder} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
            </label>
            <select name="category" defaultValue={filters.category ?? ""} aria-label={p.filters.category} className={select}>
              <option value="">{p.filters.category}: {d.common.all}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={filters.status ?? ""} aria-label={p.filters.status} className={select}>
              <option value="">{p.filters.status}: {d.common.all}</option>
              <option value="active">{d.common.active}</option>
              <option value="inactive">{d.common.inactive}</option>
            </select>
            <select name="stock" defaultValue={filters.stock ?? ""} aria-label={p.filters.stock} className={select}>
              <option value="">{p.filters.stock}: {d.common.all}</option>
              <option value="low">{p.filters.lowStock}</option>
              <option value="out">{p.filters.outOfStock}</option>
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
            <p className="py-8 text-center text-sm text-slate">{p.noResults}</p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>{p.columns.product}</th>
                  <th className={th}>{p.columns.category}</th>
                  <th className={`${th} text-right`}>{p.columns.price}</th>
                  <th className={th}>{p.columns.stock}</th>
                  <th className={th}>{p.columns.status}</th>
                  {canEdit ? <th className={th}><span className="sr-only">{d.common.edit}</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-mint/30">
                    <td className={td}>
                      <Link href={localizePath(locale, `/dashboard/products/${r.id}`)} className="flex items-center gap-3 font-semibold hover:underline">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image
                          <img src={r.image_url} alt="" className="size-10 shrink-0 rounded-xl border border-border object-cover" />
                        ) : (
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-slate">
                            <Package className="size-4" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate">{r.name}</span>
                          {r.sku ? <span className="block text-xs font-normal text-slate">{r.sku}</span> : null}
                        </span>
                      </Link>
                    </td>
                    <td className={`${td} text-slate`}>{r.category ?? "—"}</td>
                    <td className={`${td} text-right font-semibold whitespace-nowrap`}>{formatMoney(r.price, r.currency, locale)}</td>
                    <td className={td}>
                      {r.stock_quantity === null ? (
                        <span className="text-slate">{p.stock.untracked}</span>
                      ) : r.stock_quantity === 0 ? (
                        <StatusBadge tone="red">{p.stock.out}</StatusBadge>
                      ) : (
                        <StatusBadge tone={r.stock_quantity <= 5 ? "amber" : "neutral"}>{format(p.stock.units, { count: formatNumber(r.stock_quantity, locale) })}</StatusBadge>
                      )}
                    </td>
                    <td className={td}>
                      <StatusBadge tone={r.active ? "green" : "neutral"} dot>
                        {r.active ? d.common.active : d.common.inactive}
                      </StatusBadge>
                    </td>
                    {canEdit ? (
                      <td className={`${td} text-right`}>
                        <ActionButton action={setProductActive.bind(null, r.id, !r.active)} errors={d.errors} variant="ghost">
                          {r.active ? d.common.deactivate : d.common.activate}
                        </ActionButton>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            labels={d.common}
            hrefFor={(n) => withQuery(base, { ...filters, page: n })}
          />
        </Panel>
      )}
    </div>
  );
}
