import Link from "next/link";
import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionForm, DeleteButton, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { ProductForm } from "@/components/app/product-form";
import { PageHeader, Panel, StatusBadge, TableWrap, formatDate, formatMoney, formatPercent, td, th } from "@/components/app/ui";
import { adjustStock, deleteProduct } from "@/lib/actions/products";
import { isUuid } from "@/lib/actions/form";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { getPlanLimits, getProduct, listStockMovements, profitAllowed } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { ADJUST_REASONS, type StockReason } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.products.edit);

export default async function ProductPage({ params, searchParams }: PageProps<"/[lang]/dashboard/products/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/products/${id}`));
  const [product, movements] = isUuid(id) ? await Promise.all([getProduct(business.id, id, canManageBusiness(business.role)), listStockMovements(business.id, id)]) : [null, []];
  if (!product) notFound();
  const d = t.dashboard;
  const p = d.products;
  const inv = p.inventory;
  const canEdit = canManageBusiness(business.role);
  const showMargin = canEdit && profitAllowed(await getPlanLimits(business.id));
  const n = (v: number) => formatNumber(v, locale);
  const money = (v: number) => formatMoney(v, product.currency, locale);
  const unit = p.units[product.unit as keyof typeof p.units] ?? product.unit;
  const stock = product.stock_quantity;
  const status = stock === null ? null : stock === 0 ? "out" : stock <= product.low_stock_threshold ? "low" : "ok";
  const price = Number(product.price);
  const cost = product.cost_price === null ? null : Number(product.cost_price);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={product.name}
        back={{ href: localizePath(locale, "/dashboard/products"), label: p.title }}
        actions={canEdit ? <DeleteButton action={deleteProduct.bind(null, product.id, locale)} labels={d.common} errors={d.errors} note={p.deleteNote} /> : null}
      />
      {sp.saved ? <FormAlert tone="success">{p.saved}</FormAlert> : null}
      {!canEdit ? <FormAlert tone="info">{d.common.readOnly}</FormAlert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <ProductForm
            t={p}
            text={{ errors: d.errors, saved: p.saved, saving: d.common.saving }}
            product={product}
            currency={product.currency}
            locale={locale}
            canEdit={canEdit}
            submitLabel={d.common.save}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Panel id="stock" title={inv.title}>
            {stock === null ? (
              <p className="text-sm text-slate">{inv.untracked}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate">{inv.current}</p>
                    <p className="font-display text-4xl font-bold text-deep" data-testid="stock-level">
                      {n(stock)} <span className="text-base font-semibold text-slate">{unit}</span>
                    </p>
                  </div>
                  <StatusBadge tone={status === "out" ? "red" : status === "low" ? "amber" : "green"}>{status === "out" ? inv.out : status === "low" ? inv.low : inv.ok}</StatusBadge>
                </div>
                <p className="text-sm text-slate">
                  {inv.minimum}: <span className="font-semibold text-deep">{n(product.low_stock_threshold)}</span>
                </p>
              </div>
            )}
            {showMargin ? (
              <p className="mt-3 border-t border-border pt-3 text-sm text-slate">
                {inv.margin}:{" "}
                {cost === null ? (
                  inv.noCost
                ) : (
                  <span className="font-semibold text-deep">{format(inv.marginValue, { amount: money(price - cost), percent: price > 0 ? formatPercent((price - cost) / price, locale) : "—" })}</span>
                )}
              </p>
            ) : null}
          </Panel>

          <Panel id="adjust-stock" title={inv.adjust.title} description={inv.adjust.text}>
            {canEdit ? (
              <ActionForm action={adjustStock} text={{ errors: d.errors, saved: inv.adjust.saved, saving: inv.adjust.saving }} successMessage={inv.adjust.saved} hidden={{ product_id: product.id }}>
                <SelectField name="reason" label={inv.adjust.reason} defaultValue="purchase" options={ADJUST_REASONS.map((r) => ({ value: r, label: inv.reasons[r] }))} />
                {product.product_variants.length ? (
                  <SelectField
                    name="variant_id"
                    label={inv.adjust.variant}
                    defaultValue=""
                    options={[{ value: "", label: inv.adjust.wholeProduct }, ...product.product_variants.map((v) => ({ value: v.id, label: `${v.name}: ${v.value}` }))]}
                  />
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="quantity" label={inv.adjust.quantity} inputMode="numeric" />
                  <TextField name="counted" label={inv.adjust.counted} inputMode="numeric" />
                </div>
                <p className="-mt-2 text-xs text-slate">{inv.adjust.countedHint}</p>
                <TextField name="note" label={inv.adjust.note} maxLength={300} />
                <div>
                  <SubmitButton>{inv.adjust.submit}</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-slate">{inv.adjust.ownersOnly}</p>
            )}
          </Panel>
        </div>
      </div>

      <Panel id="stock-history" title={inv.history.title}>
        {movements.length ? (
          <TableWrap>
            <thead>
              <tr>
                {[inv.history.date, inv.history.reason, inv.history.change, inv.history.before, inv.history.after, inv.history.by].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(m.created_at, locale, true)}</td>
                  <td className={td}>
                    <span className="font-semibold">{inv.reasons[m.reason as StockReason] ?? m.reason}</span>
                    {m.product_variants ? <span className="block text-xs text-slate">{`${m.product_variants.name}: ${m.product_variants.value}`}</span> : null}
                    {m.orders && m.order_id ? (
                      <Link href={localizePath(locale, `/dashboard/sales/${m.order_id}`)} className="block text-xs font-semibold text-waza-700 hover:underline">
                        {m.orders.order_number}
                      </Link>
                    ) : null}
                    {m.note ? <span className="block text-xs text-slate">{m.note}</span> : null}
                  </td>
                  <td className={`${td} font-semibold ${m.quantity_change > 0 ? "text-success" : "text-coral-700"}`}>
                    {m.quantity_change > 0 ? "+" : "−"}
                    {n(Math.abs(m.quantity_change))}
                  </td>
                  <td className={td}>{n(m.previous_stock)}</td>
                  <td className={`${td} font-semibold`}>{n(m.new_stock)}</td>
                  <td className={`${td} text-slate`}>{m.by ?? inv.history.system}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-slate">{inv.history.empty}</p>
        )}
      </Panel>
    </div>
  );
}
