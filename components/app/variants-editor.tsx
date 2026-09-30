"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { useFieldError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/messages/en";

export type VariantRow = { id?: string; name: string; value: string; stock_quantity: string; price_modifier: string };

/** Variants are submitted as one JSON field ("variants"), validated on the server by variantSchema. */
export function VariantsEditor({ t, initial }: { t: Messages["dashboard"]["products"]["variants"]; initial: VariantRow[] }) {
  const [rows, setRows] = useState<VariantRow[]>(initial);
  const error = useFieldError("variants");
  const update = (i: number, patch: Partial<VariantRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const input = "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";

  return (
    <div className="flex flex-col gap-3">
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(
          rows
            .filter((r) => r.name.trim() || r.value.trim())
            .map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name, value: r.value, stock_quantity: r.stock_quantity, price_modifier: r.price_modifier })),
        )}
      />
      {rows.length ? (
        <div className="flex flex-col gap-2">
          <div className="hidden grid-cols-[1fr_1fr_6rem_7rem_2.5rem] gap-2 px-1 text-xs font-semibold text-slate sm:grid">
            <span>{t.name}</span>
            <span>{t.value}</span>
            <span>{t.stock}</span>
            <span>{t.priceModifier}</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 rounded-2xl border border-border p-2 sm:grid-cols-[1fr_1fr_6rem_7rem_2.5rem] sm:border-0 sm:p-0">
              <input aria-label={t.name} placeholder={t.namePlaceholder} value={row.name} maxLength={60} onChange={(e) => update(i, { name: e.target.value })} className={input} />
              <input aria-label={t.value} placeholder={t.valuePlaceholder} value={row.value} maxLength={80} onChange={(e) => update(i, { value: e.target.value })} className={input} />
              <input aria-label={t.stock} inputMode="numeric" value={row.stock_quantity} onChange={(e) => update(i, { stock_quantity: e.target.value })} className={input} />
              <input aria-label={t.priceModifier} inputMode="decimal" value={row.price_modifier} onChange={(e) => update(i, { price_modifier: e.target.value })} className={input} />
              <Button type="button" variant="ghost" size="icon" aria-label={t.remove} className="col-span-2 size-10 justify-self-end sm:col-span-1" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                <X aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-coral-700">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows((r) => [...r, { name: r.at(-1)?.name ?? "", value: "", stock_quantity: "", price_modifier: "0" }])}>
          <Plus aria-hidden /> {t.add}
        </Button>
      </div>
    </div>
  );
}
