"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Package, Plus, Search, Trash2 } from "lucide-react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { createSale, type SaleError, type SaleInput } from "@/lib/actions/sales";
import type { PosProduct } from "@/lib/data/queries";
import type { Locale } from "@/lib/i18n/config";
import { currencyLabel, format, formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";
import { RECEIVE_METHODS } from "@/types/database";

type Line = { key: string; productId: string; variantId: string | null; name: string; detail: string | null; price: number; qty: number; max: number | null };
type Customer = { id: string; name: string; whatsapp_phone: string };

const field = "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-[0.9375rem] text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";
const toNumber = (v: string) => Math.max(0, Number(v.replace(/[\s  ,]/g, "")) || 0);

/**
 * The point of sale. Prices shown here are for the cashier; the database
 * recomputes everything from the catalog when the sale is completed. The
 * sale's client key stays the same until it succeeds, so retrying never
 * records it twice.
 */
export function Pos({
  products,
  customers,
  defaultCustomer,
  currency,
  locale,
  canDiscount,
  t,
  payments,
  productsHref,
}: {
  products: PosProduct[];
  customers: Customer[];
  /** Customer chosen up front, e.g. from their profile's "New sale" link. */
  defaultCustomer?: string;
  currency: string;
  locale: Locale;
  canDiscount: boolean;
  t: Messages["dashboard"]["sales"];
  payments: Messages["dashboard"]["payments"];
  productsHref: string;
}) {
  const router = useRouter();
  const { href } = useI18n();
  const p = t.pos;
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<string>(() => (defaultCustomer && customers.some((c) => c.id === defaultCustomer) ? defaultCustomer : "walkin"));
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [amount, setAmount] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const money = (n: number) => `${formatNumber(n, locale)} ${currencyLabel(currency)}`;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((x) => x.name.toLowerCase().includes(q) || (x.sku ?? "").toLowerCase().includes(q) || (x.category ?? "").toLowerCase().includes(q)) : products;
  }, [products, query]);

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const disc = canDiscount ? Math.min(toNumber(discount), subtotal) : 0;
  const total = subtotal - disc;
  const typed = amount === null ? (method === "credit" ? 0 : total) : toNumber(amount);
  const paidNow = method === "credit" ? 0 : Math.min(typed, total);
  const change = method === "cash" ? Math.max(0, typed - total) : 0;
  const onCredit = total - paidNow;

  const add = (product: PosProduct, variant?: PosProduct["product_variants"][number]) => {
    const key = `${product.id}:${variant?.id ?? ""}`;
    const tracked = variant && variant.stock_quantity !== null ? variant.stock_quantity : product.stock_quantity;
    setError(null);
    setLines((rows) => {
      const found = rows.find((r) => r.key === key);
      if (found) return rows.map((r) => (r.key === key && (r.max === null || r.qty < r.max) ? { ...r, qty: r.qty + 1 } : r));
      if (tracked !== null && tracked <= 0) return rows;
      return [
        ...rows,
        {
          key,
          productId: product.id,
          variantId: variant?.id ?? null,
          name: product.name,
          detail: variant ? `${variant.name}: ${variant.value}` : null,
          price: Math.max(0, product.price + (variant?.price_modifier ?? 0)),
          qty: 1,
          max: tracked,
        },
      ];
    });
  };
  const setQty = (key: string, qty: number) => setLines((rows) => rows.flatMap((r) => (r.key !== key ? [r] : qty <= 0 ? [] : [{ ...r, qty: r.max === null ? qty : Math.min(qty, r.max) }])));

  const errorText = (e: SaleError, item?: string) => {
    if (e === "out_of_stock") return format(p.errors.out_of_stock, { item: item ?? "" });
    if (e in p.errors) return p.errors[e as keyof typeof p.errors];
    return p.errors.failed;
  };

  const complete = () => {
    if (!lines.length) return setError(p.errors.empty);
    if (onCredit > 0 && customer === "walkin") return setError(p.errors.credit_needs_customer);
    if (customer === "new" && (!newName.trim() || !/^\+?[0-9 ()-]{6,24}$/.test(newPhone.trim()))) return setError(p.errors.customer);
    setError(null);
    startTransition(async () => {
      try {
        const result = await createSale({
          client_key: clientKey,
          items: lines.map((l) => ({ product_id: l.productId, variant_id: l.variantId, quantity: l.qty })),
          customer: customer === "walkin" ? null : customer === "new" ? { name: newName.trim(), phone: newPhone.trim() } : { id: customer },
          discount: disc,
          payment: { method: method as SaleInput["payment"]["method"], amount: paidNow, reference: reference || null },
          notes: notes || null,
        });
        if (!result.ok) return setError(errorText(result.error, result.item));
        setClientKey(crypto.randomUUID());
        router.push(href(`/dashboard/sales/${result.id}?new=1`));
      } catch {
        setError(p.errors.failed);
      }
    });
  };

  if (!products.length) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-card">
        <Package className="mx-auto size-8 text-slate" aria-hidden />
        <p className="mt-3 text-sm text-slate">{p.addProducts}</p>
        <a href={productsHref} className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground">
          {p.goToProducts}
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_24rem] lg:pb-0">
      {/* Products */}
      <section aria-label={p.search} className="min-w-0">
        <label className="relative block">
          <span className="sr-only">{p.search}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={p.search} className={cn(field, "pl-9")} />
        </label>
        {shown.length ? (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((prod) => {
              const out = prod.stock_quantity !== null && prod.stock_quantity <= 0 && !prod.product_variants.some((v) => v.stock_quantity === null || v.stock_quantity > 0);
              return (
                <li key={prod.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                  <button
                    type="button"
                    onClick={() => (prod.product_variants.length ? undefined : add(prod))}
                    disabled={out || prod.product_variants.length > 0}
                    aria-label={`${prod.name} — ${money(prod.price)}`}
                    className="flex flex-1 flex-col text-left enabled:hover:bg-mint/40 disabled:cursor-default"
                  >
                    {prod.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image
                      <img src={prod.image_url} alt="" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <span className="grid aspect-[4/3] w-full place-items-center bg-surface text-slate">
                        <Package className="size-6" aria-hidden />
                      </span>
                    )}
                    <span className="flex flex-1 flex-col gap-0.5 p-3">
                      <span className="line-clamp-2 text-sm font-semibold text-deep">{prod.name}</span>
                      <span className="font-display text-base font-bold text-deep">{money(prod.price)}</span>
                      <span className={cn("text-xs", out ? "font-semibold text-coral-700" : "text-slate")}>
                        {out ? p.out : prod.stock_quantity === null ? "" : format(p.left, { count: formatNumber(prod.stock_quantity, locale) })}
                      </span>
                    </span>
                  </button>
                  {prod.product_variants.length ? (
                    <div className="flex flex-wrap gap-1.5 border-t border-border p-2">
                      {prod.product_variants.map((v) => {
                        const vOut = v.stock_quantity !== null ? v.stock_quantity <= 0 : prod.stock_quantity !== null && prod.stock_quantity <= 0;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            disabled={vOut}
                            onClick={() => add(prod, v)}
                            className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-deep enabled:hover:border-waza-500 enabled:hover:bg-mint disabled:opacity-40"
                          >
                            {v.value}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-10 text-center text-sm text-slate">{p.noProducts}</p>
        )}
      </section>

      {/* The sale */}
      <section aria-labelledby="pos-cart-title" className="flex h-fit flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20">
        <h2 id="pos-cart-title" className="type-h3 text-lg">
          {p.cart}
        </h2>
        {lines.length ? (
          <ul className="flex flex-col divide-y divide-border" data-testid="pos-cart">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-deep">{l.name}</p>
                  <p className="text-xs text-slate">
                    {l.detail ? `${l.detail} · ` : ""}
                    {money(l.price)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`${p.decrease}: ${l.name}`} onClick={() => setQty(l.key, l.qty - 1)} className="grid size-9 place-items-center rounded-full border border-border hover:bg-mint">
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <span className="w-7 text-center font-semibold" aria-label={`${l.name}: ${l.qty}`}>
                    {l.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`${p.increase}: ${l.name}`}
                    disabled={l.max !== null && l.qty >= l.max}
                    onClick={() => setQty(l.key, l.qty + 1)}
                    className="grid size-9 place-items-center rounded-full border border-border hover:bg-mint disabled:opacity-40"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
                <p className="w-24 text-right text-sm font-semibold whitespace-nowrap text-deep">{money(l.price * l.qty)}</p>
                <button type="button" aria-label={`${p.remove}: ${l.name}`} onClick={() => setQty(l.key, 0)} className="text-slate hover:text-coral-700">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-surface p-4 text-sm text-slate">{p.emptyCart}</p>
        )}

        <label className="grid gap-1.5 text-sm font-semibold text-deep">
          {p.customer}
          <select aria-label={p.customer} value={customer} onChange={(e) => setCustomer(e.target.value)} className={field}>
            <option value="walkin">{p.walkIn}</option>
            <option value="new">{p.newCustomer}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || `+${c.whatsapp_phone}`}
              </option>
            ))}
          </select>
        </label>
        {customer === "new" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-semibold text-deep">
              {p.customerName}
              <input aria-label={p.customerName} value={newName} onChange={(e) => setNewName(e.target.value)} className={field} autoComplete="off" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-deep">
              {p.customerPhone}
              <input aria-label={p.customerPhone} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={field} inputMode="tel" autoComplete="off" />
            </label>
          </div>
        ) : null}

        <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate">{p.subtotal}</dt>
            <dd className="text-deep">{money(subtotal)}</dd>
          </div>
          {canDiscount ? (
            <div className="flex items-center justify-between gap-3">
              <dt>
                <label htmlFor="pos-discount" className="text-slate">
                  {p.discount}
                </label>
              </dt>
              <dd>
                <input id="pos-discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" className={cn(field, "h-9 w-32 text-right")} />
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="font-display text-lg font-bold text-deep">{p.total}</dt>
            <dd className="font-display text-lg font-bold text-deep" data-testid="pos-total">
              {money(total)}
            </dd>
          </div>
        </dl>

        <label className="grid gap-1.5 text-sm font-semibold text-deep">
          {p.payment}
          <select
            aria-label={p.payment}
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setAmount(null);
            }}
            className={field}
          >
            {RECEIVE_METHODS.map((m) => (
              <option key={m} value={m}>
                {payments.methods[m]}
              </option>
            ))}
            <option value="credit">{p.credit}</option>
          </select>
        </label>
        {method !== "credit" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-semibold text-deep">
              {p.amountPaid}
              <input aria-label={p.amountPaid} value={amount ?? String(total)} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} />
            </label>
            {method !== "cash" ? (
              <label className="grid gap-1.5 text-sm font-semibold text-deep">
                {p.reference}
                <input aria-label={p.reference} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} className={field} />
              </label>
            ) : null}
          </div>
        ) : null}
        {change > 0 ? (
          <p className="rounded-xl bg-mint/60 px-3 py-2 text-sm font-semibold text-deep">
            {p.change}: {money(change)}
          </p>
        ) : null}
        {onCredit > 0 && lines.length ? (
          <p className="rounded-xl bg-gold-50 px-3 py-2 text-sm font-semibold text-gold-800" data-testid="pos-credit">
            {p.onCredit}: {money(onCredit)}
          </p>
        ) : null}
        <label className="grid gap-1.5 text-sm font-semibold text-deep">
          {p.notes}
          <input aria-label={p.notes} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={field} />
        </label>

        {error ? (
          <p role="alert" className="rounded-xl bg-coral-50 px-3 py-2 text-sm font-semibold text-coral-700">
            {error}
          </p>
        ) : null}

        {/* Sticky on phones so the total and the button are always in reach. */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-cream/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <button
            type="button"
            onClick={complete}
            disabled={pending}
            className="flex h-12 w-full items-center justify-between rounded-full bg-primary px-5 text-base font-bold text-primary-foreground hover:bg-waza-400 disabled:opacity-60"
          >
            <span>{pending ? p.completing : p.complete}</span>
            <span>{money(total)}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
