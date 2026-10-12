"use client";

import { availableValues, type Combination, type PickVariant, type ProductOption } from "@/lib/products/options";
import { cn } from "@/lib/utils";

/**
 * Choose a combination option by option, in order (colour, then size …).
 * A value is greyed out when no combination in stock has it, given the
 * values already chosen for the options before it.
 */
export function OptionPicker({
  options,
  variants,
  productStock,
  value,
  onChange,
  outLabel,
  size = "md",
}: {
  options: ProductOption[];
  variants: PickVariant[];
  productStock: number | null;
  value: Combination;
  onChange: (next: Combination) => void;
  outLabel: string;
  size?: "sm" | "md";
}) {
  const choose = (index: number, v: string) => {
    let next: Combination = { ...value, [options[index].name]: v };
    // A later choice that is no longer available is cleared.
    for (let i = index + 1; i < options.length; i++) {
      const o = options[i];
      const prefix = Object.fromEntries(options.slice(0, i).map((x) => [x.name, next[x.name]]).filter(([, x]) => x !== undefined));
      if (next[o.name] !== undefined && !availableValues(options, variants, productStock, prefix)[o.name]?.has(next[o.name])) {
        next = Object.fromEntries(Object.entries(next).filter(([k]) => k !== o.name));
      }
    }
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {options.map((o, i) => {
        const prefix = Object.fromEntries(options.slice(0, i).map((x) => [x.name, value[x.name]]).filter(([, x]) => x !== undefined));
        const available = availableValues(options, variants, productStock, prefix)[o.name] ?? new Set<string>();
        return (
          <div key={o.name} role="radiogroup" aria-label={o.name} className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold tracking-wide text-slate uppercase">{o.name}</span>
            <div className="flex flex-wrap gap-1.5">
              {o.values.map((v) => {
                const ok = available.has(v.value);
                const selected = value[o.name] === v.value;
                return (
                  <button
                    key={v.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!ok}
                    title={ok ? v.value : `${v.value} — ${outLabel}`}
                    onClick={() => choose(i, v.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border font-semibold text-deep",
                      size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
                      selected ? "border-waza-600 bg-mint ring-2 ring-waza-500/30" : "border-border enabled:hover:border-waza-500 enabled:hover:bg-mint",
                      "disabled:cursor-not-allowed disabled:line-through disabled:opacity-40",
                    )}
                  >
                    {o.colour ? <span aria-hidden className="size-3 shrink-0 rounded-full border border-black/15" style={{ background: v.hex ?? "transparent" }} /> : null}
                    {v.value}
                    {ok ? null : <span className="sr-only"> — {outLabel}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
