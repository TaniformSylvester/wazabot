"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";

import { useFieldError, useFormResult } from "@/components/app/form";
import { formatMoney } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/config";
import { extrasLabel, linePrice, type Extra } from "@/lib/restaurant/extras";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

export type PickerDish = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  extras: Extra[];
  variants: { id: string; label: string; price: number; available: boolean }[];
  available: boolean;
};

type Line = { key: string; dish: PickerDish; variantId: string | null; quantity: number; extras: Extra[]; note: string };

const input = "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";

/**
 * The menu for a waiter or cashier: search, pick a dish, its option, extras,
 * quantity and a note for the kitchen; the chosen lines are submitted as the
 * JSON field "items" (the database prices them again from the menu). Used
 * inside an ActionForm; the list clears after a successful save.
 */
export function MenuPicker({ menu, currency, locale, t }: { menu: PickerDish[]; currency: string; locale: Locale; t: Messages["dashboard"]["restaurant"]["menu"] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ dish: PickerDish; variantId: string | null; quantity: number; extras: Set<string>; note: string } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const result = useFormResult();
  const error = useFieldError("items");
  const money = (v: number) => formatMoney(v, currency, locale);

  // A successful save: the lines are on the order now (reset while rendering, when the result changes).
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    if (result.status === "success") {
      setLines([]);
      setEditing(null);
    }
  }

  const categories = useMemo(() => [...new Set(menu.map((d) => d.category).filter((c): c is string => !!c))], [menu]);
  const shown = menu.filter((d) => (!category || d.category === category) && (!query.trim() || d.name.toLowerCase().includes(query.trim().toLowerCase())));
  const unitPrice = (dish: PickerDish, variantId: string | null, extras: Extra[]) => linePrice(dish.variants.find((v) => v.id === variantId)?.price ?? dish.price, extras);
  const total = lines.reduce((sum, l) => sum + unitPrice(l.dish, l.variantId, l.extras) * l.quantity, 0);
  const items = lines.map((l) => ({ product_id: l.dish.id, variant_id: l.variantId, quantity: l.quantity, extras: l.extras.map((e) => e.name), note: l.note.trim() || undefined }));

  if (!menu.length) return <p className="text-sm text-slate">{t.noMenu}</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="menu-picker">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="flex min-w-0 flex-col gap-3">
        <label className="relative">
          <span className="sr-only">{t.search}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
          <input className={cn(input, "pl-9")} value={query} placeholder={t.search} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {categories.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {[null, ...categories].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                onClick={() => setCategory(c)}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold", category === c ? "border-deep bg-deep text-cream" : "border-border bg-card text-deep")}
              >
                {c ?? t.all}
              </button>
            ))}
          </div>
        ) : null}
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="menu-dishes">
          {shown.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                disabled={!d.available}
                onClick={() => setEditing({ dish: d, variantId: d.variants.find((v) => v.available)?.id ?? null, quantity: 1, extras: new Set(), note: "" })}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm",
                  editing?.dish.id === d.id ? "border-waza-500 bg-mint" : "border-border bg-card hover:border-waza-500",
                  !d.available && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-deep">{d.name}</span>
                  {d.extras.length ? <span className="block truncate text-xs text-slate">{extrasLabel(d.extras)}</span> : null}
                </span>
                <span className="shrink-0 font-semibold whitespace-nowrap text-deep">{money(d.price)}</span>
              </button>
            </li>
          ))}
        </ul>

        {editing ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-waza-500 bg-card p-4" data-testid="dish-editor">
            <p className="font-display font-bold text-deep">{editing.dish.name}</p>
            {editing.dish.variants.length ? (
              <label className="flex flex-col gap-1 text-sm font-semibold text-deep">
                {t.option}
                <select className={input} value={editing.variantId ?? ""} onChange={(e) => setEditing({ ...editing, variantId: e.target.value })}>
                  {editing.dish.variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={!v.available}>
                      {v.label} — {money(v.price)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {editing.dish.extras.length ? (
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-sm font-semibold text-deep">{t.extras}</legend>
                {editing.dish.extras.map((e) => (
                  <label key={e.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-waza-600"
                        checked={editing.extras.has(e.name)}
                        onChange={(ev) => {
                          const next = new Set(editing.extras);
                          if (ev.target.checked) next.add(e.name);
                          else next.delete(e.name);
                          setEditing({ ...editing, extras: next });
                        }}
                      />
                      {e.name}
                    </span>
                    <span className="text-slate">{e.price ? `+ ${money(e.price)}` : "—"}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-deep">{t.quantity}</span>
              <Button type="button" variant="outline" size="icon" aria-label="−" onClick={() => setEditing({ ...editing, quantity: Math.max(1, editing.quantity - 1) })}>
                <Minus aria-hidden />
              </Button>
              <span className="w-8 text-center font-semibold" data-testid="dish-quantity">
                {editing.quantity}
              </span>
              <Button type="button" variant="outline" size="icon" aria-label="+" onClick={() => setEditing({ ...editing, quantity: Math.min(999, editing.quantity + 1) })}>
                <Plus aria-hidden />
              </Button>
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold text-deep">
              {t.note}
              <input className={input} value={editing.note} maxLength={200} placeholder={t.notePlaceholder} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  const extras = editing.dish.extras.filter((e) => editing.extras.has(e.name));
                  setLines([...lines, { key: Math.random().toString(36).slice(2), dish: editing.dish, variantId: editing.variantId, quantity: editing.quantity, extras, note: editing.note }]);
                  setEditing(null);
                }}
              >
                {t.add} · {money(unitPrice(editing.dish, editing.variantId, editing.dish.extras.filter((e) => editing.extras.has(e.name))) * editing.quantity)}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
        <p className="font-semibold text-deep">{t.cart}</p>
        {lines.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm" data-testid="picker-lines">
            {lines.map((l) => {
              const variant = l.dish.variants.find((v) => v.id === l.variantId);
              return (
                <li key={l.key} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-semibold text-deep">
                      {l.quantity} × {l.dish.name}
                    </span>
                    {variant ? <span className="block text-xs text-slate">{variant.label}</span> : null}
                    {l.extras.length ? <span className="block text-xs text-slate">+ {extrasLabel(l.extras)}</span> : null}
                    {l.note.trim() ? <span className="block text-xs text-slate italic">“{l.note.trim()}”</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="whitespace-nowrap">{money(unitPrice(l.dish, l.variantId, l.extras) * l.quantity)}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`${t.remove} ${l.dish.name}`} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                      <X aria-hidden />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate">{t.emptyCart}</p>
        )}
        {lines.length ? (
          <p className="flex justify-between border-t border-border pt-2 font-semibold text-deep">
            <span>{t.total}</span>
            <span data-testid="picker-total">{money(total)}</span>
          </p>
        ) : null}
        {error ? <p className="text-sm text-coral-700">{error}</p> : null}
      </div>
    </div>
  );
}
