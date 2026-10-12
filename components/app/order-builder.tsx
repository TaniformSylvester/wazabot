"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, useFieldError, type FormText } from "@/components/app/form";
import { OptionPicker } from "@/components/app/option-picker";
import { Button } from "@/components/ui/button";
import { createOrder } from "@/lib/actions/orders";
import { currencyLabel, format, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { findVariant, usesOptions, variantAvailable, variantLabel, type Combination, type ProductOption } from "@/lib/products/options";
import { DELIVERY_METHODS, PAYMENT_METHODS } from "@/types/database";
import type { Messages } from "@/messages/en";

type O = Messages["dashboard"]["orders"];
export type SellableProduct = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number | null;
  options: ProductOption[];
  product_variants: { id: string; name: string; value: string; options: unknown; price_modifier: number; stock_quantity: number | null }[];
};
type Item =
  | { key: number; kind: "product"; product_id: string; variant_id: string; choice?: Combination; quantity: string }
  | { key: number; kind: "custom"; name: string; unit_price: string; quantity: string };

const toNumber = (v: string) => Number(v.replace(/[\s,]/g, "")) || 0;
const input = "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";

/** Order form: items are sent as JSON; prices and totals are recomputed by create_order() in the database. */
export function OrderBuilder({
  t,
  text,
  customers,
  products,
  currency,
  locale,
  defaultCustomerId,
  conversationId,
  picker,
}: {
  t: O;
  text: FormText;
  customers: { id: string; reference: string; name: string; whatsapp_phone: string }[];
  products: SellableProduct[];
  currency: string;
  locale: Locale;
  defaultCustomerId?: string;
  conversationId?: string;
  picker: Messages["dashboard"]["products"]["picker"];
}) {
  const f = t.fields;
  const [items, setItems] = useState<Item[]>([]);
  const [fee, setFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const update = (key: number, patch: Partial<Item>) => setItems((rows) => rows.map((r) => (r.key === key ? ({ ...r, ...patch } as Item) : r)));
  const nextKey = () => Math.max(0, ...items.map((i) => i.key)) + 1;

  const unitPrice = (i: Item) => {
    if (i.kind === "custom") return toNumber(i.unit_price);
    const p = byId.get(i.product_id);
    if (!p) return 0;
    const v = p.product_variants.find((x) => x.id === i.variant_id);
    return Math.max(0, Number(p.price) + (v ? Number(v.price_modifier) : 0));
  };
  const subtotal = items.reduce((s, i) => s + unitPrice(i) * (Math.trunc(toNumber(i.quantity)) || 0), 0);
  const total = subtotal + toNumber(fee) - toNumber(discount);
  const payload = items.map((i) =>
    i.kind === "product"
      ? { product_id: i.product_id, variant_id: i.variant_id || null, quantity: Math.trunc(toNumber(i.quantity)) }
      : { name: i.name, unit_price: toNumber(i.unit_price), quantity: Math.trunc(toNumber(i.quantity)) },
  );
  const money = (n: number) => `${formatNumber(n, locale)} ${currencyLabel(currency)}`;

  return (
    <ActionForm action={createOrder} text={text} hidden={{ locale, conversation_id: conversationId }}>
      <input type="hidden" name="items" value={JSON.stringify(items.length ? payload : [])} />
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        {customers.length ? (
          <SelectField
            name="customer_id"
            label={f.customer}
            defaultValue={defaultCustomerId ?? ""}
            placeholder={f.chooseCustomer}
            options={customers.map((c) => ({ value: c.id, label: `${c.name || `+${c.whatsapp_phone}`} · ${c.reference} · +${c.whatsapp_phone}` }))}
            required
          />
        ) : (
          <p className="text-sm text-coral-700">{f.noCustomers}</p>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <p className="mb-3 text-sm font-semibold text-deep">{f.items}</p>
        <ItemsError />
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.key} className="grid grid-cols-2 gap-2 rounded-2xl border border-border p-2 sm:grid-cols-[2fr_1.5fr_5rem_7rem_2.5rem] sm:items-center">
              {i.kind === "product" ? (
                <>
                  <select aria-label={f.product} value={i.product_id} onChange={(e) => update(i.key, { product_id: e.target.value, variant_id: "", choice: {} })} className={`${input} col-span-2 sm:col-span-1`}>
                    <option value="">{f.chooseProduct}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {money(Number(p.price))}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const p = byId.get(i.product_id);
                    if (!p?.product_variants.length) return <span className="hidden sm:block" />;
                    if (usesOptions(p.options, p.product_variants)) {
                      const v = p.product_variants.find((x) => x.id === i.variant_id);
                      return (
                        <span className={`col-span-2 self-center text-sm sm:col-span-1 ${v ? "font-semibold text-deep" : "text-slate"}`} data-testid="order-item-choice">
                          {v ? variantLabel(v, p.options) : format(picker.choose, { option: p.options.map((o) => o.name).join(", ") })}
                        </span>
                      );
                    }
                    return (
                      <select aria-label={f.variant} value={i.variant_id} onChange={(e) => update(i.key, { variant_id: e.target.value })} className={`${input} col-span-2 sm:col-span-1`}>
                        <option value="">{f.variant}</option>
                        {p.product_variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}: {v.value}
                            {Number(v.price_modifier) ? ` (${Number(v.price_modifier) > 0 ? "+" : ""}${formatNumber(Number(v.price_modifier), locale)})` : ""}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </>
              ) : (
                <>
                  <input aria-label={f.customName} placeholder={f.customName} value={i.name} maxLength={200} onChange={(e) => update(i.key, { name: e.target.value })} className={`${input} col-span-2 sm:col-span-1`} />
                  <input aria-label={f.unitPrice} placeholder={f.unitPrice} inputMode="decimal" value={i.unit_price} onChange={(e) => update(i.key, { unit_price: e.target.value })} className={`${input} col-span-2 sm:col-span-1`} />
                </>
              )}
              <input aria-label={f.quantity} inputMode="numeric" value={i.quantity} onChange={(e) => update(i.key, { quantity: e.target.value })} className={input} />
              <span className="self-center text-right text-sm font-semibold text-deep">{money(unitPrice(i) * (Math.trunc(toNumber(i.quantity)) || 0))}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={f.remove} className="col-span-2 size-10 justify-self-end sm:col-span-1" onClick={() => setItems((r) => r.filter((x) => x.key !== i.key))}>
                <X aria-hidden />
              </Button>
              {i.kind === "product" && byId.get(i.product_id) && usesOptions(byId.get(i.product_id)!.options, byId.get(i.product_id)!.product_variants) ? (
                <div className="col-span-2 rounded-xl bg-surface p-2 sm:col-span-5">
                  <OptionPicker
                    options={byId.get(i.product_id)!.options}
                    variants={byId.get(i.product_id)!.product_variants}
                    productStock={byId.get(i.product_id)!.stock_quantity}
                    value={i.choice ?? {}}
                    onChange={(choice) => {
                      const p = byId.get(i.product_id)!;
                      const v = findVariant(p.options, p.product_variants, choice);
                      update(i.key, { choice, variant_id: v && variantAvailable(v, p.stock_quantity) ? v.id : "" });
                    }}
                    outLabel={picker.out}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={!products.length} onClick={() => setItems((r) => [...r, { key: nextKey(), kind: "product", product_id: "", variant_id: "", quantity: "1" }])}>
            <Plus aria-hidden /> {f.addItem}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setItems((r) => [...r, { key: nextKey(), kind: "custom", name: "", unit_price: "", quantity: "1" }])}>
            <Plus aria-hidden /> {f.addCustom}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 rounded-3xl border border-border bg-card p-5 shadow-card sm:grid-cols-2 sm:p-6">
        <TextField name="delivery_fee" label={f.deliveryFee} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        <TextField name="discount" label={f.discount} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <SelectField name="payment_method" label={f.paymentMethod} defaultValue="" placeholder={f.noMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t.methods[m] }))} />
        <SelectField name="delivery_method" label={f.deliveryMethod} defaultValue="" placeholder={f.noDeliveryMethod} options={DELIVERY_METHODS.map((m) => ({ value: m, label: f.deliveryMethods[m] }))} />
        <TextField name="delivery_address" label={f.deliveryAddress} maxLength={500} />
        <TextField name="recipient_name" label={f.recipientName} maxLength={120} />
        <TextField name="recipient_phone" label={f.recipientPhone} maxLength={24} type="tel" />
        <TextField name="pickup_location" label={f.pickupLocation} maxLength={300} />
        <TextField name="delivery_notes" label={f.deliveryNotes} maxLength={1000} />
        <TextArea name="notes" label={f.notes} maxLength={2000} rows={2} className="sm:col-span-2" />
        <p className="text-xs text-slate sm:col-span-2">{t.paymentNote}</p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <dl className="ml-auto flex max-w-xs flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate">{t.totals.subtotal}</dt>
            <dd className="font-semibold text-deep">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate">{t.totals.delivery}</dt>
            <dd className="text-deep">{money(toNumber(fee))}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate">{t.totals.discount}</dt>
            <dd className="text-deep">−{money(toNumber(discount))}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-base">
            <dt className="font-semibold text-deep">{t.totals.total}</dt>
            <dd className={total < 0 ? "font-bold text-coral-700" : "font-bold text-deep"}>{money(total)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-right text-xs text-slate">{t.totals.estimate}</p>
      </div>

      <div>
        <SubmitButton>{t.new}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function ItemsError() {
  const error = useFieldError("items");
  return error ? (
    <p role="alert" className="mb-2 text-xs font-medium text-coral-700">
      {error}
    </p>
  ) : null;
}
