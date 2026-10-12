"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { useFieldError } from "@/components/app/form";
import { VariantsEditor, type VariantRow } from "@/components/app/variants-editor";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/i18n/format";
import { combinationCount, combinationKey, combinationNameValue, combinations, MAX_COMBINATIONS, MAX_OPTIONS, MAX_OPTION_VALUES, OPTION_NAME_MAX, OPTION_VALUE_MAX, type Combination, type ProductOption } from "@/lib/products/options";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

type Value = { uid: string; value: string; hex: string | null; image_url: string | null };
type Option = { uid: string; name: string; colour: boolean; values: Value[]; draft: string };
type Cell = { stock: string; price: string };
export type CombinationRow = { options: Combination; stock_quantity: number | null; price_modifier: number };

const input = "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";
const uid = () => Math.random().toString(36).slice(2);
const SIZES = ["S", "M", "L", "XL"];

/**
 * Options (Colour, Size …) and the grid of their combinations. Submitted as two
 * JSON fields, "options" and "variants" (validated by productSchema); colour
 * photos as files named colour_image__<value>. Without options, the older
 * one-option-per-row variants editor is shown.
 */
export function OptionsEditor({
  t,
  tv,
  initialOptions,
  initialCombinations,
  legacy,
}: {
  t: Messages["dashboard"]["products"]["options"];
  tv: Messages["dashboard"]["products"]["variants"];
  initialOptions: ProductOption[];
  initialCombinations: CombinationRow[];
  legacy: VariantRow[];
}) {
  const [options, setOptions] = useState<Option[]>(() =>
    initialOptions.map((o) => ({ uid: uid(), name: o.name, colour: Boolean(o.colour), draft: "", values: o.values.map((v) => ({ uid: uid(), value: v.value, hex: v.hex ?? null, image_url: v.image_url ?? null })) })),
  );
  const [cells, setCells] = useState<Map<string, Cell>>(() => {
    const m = new Map<string, Cell>();
    for (const c of initialCombinations) m.set(combinationKey(c.options, initialOptions), { stock: c.stock_quantity === null ? "" : String(c.stock_quantity), price: String(c.price_modifier) });
    return m;
  });
  const [allStock, setAllStock] = useState("");
  const optionsError = useFieldError("options");
  const variantsError = useFieldError("variants");

  const defined: ProductOption[] = useMemo(
    () => options.filter((o) => o.name.trim() && o.values.length).map((o) => ({ name: o.name.trim(), colour: o.colour, values: o.values.map((v) => ({ value: v.value, hex: v.hex, image_url: v.image_url })) })),
    [options],
  );
  const count = combinationCount(defined);
  const rows = useMemo(() => (count <= MAX_COMBINATIONS ? combinations(defined) : []), [defined, count]);
  const legacyCount = legacy.length && !initialOptions.length ? legacy.length : 0;

  const patch = (id: string, p: Partial<Option>) => setOptions((os) => os.map((o) => (o.uid === id ? { ...o, ...p } : o)));
  const patchValue = (id: string, vid: string, p: Partial<Value>) =>
    setOptions((os) => os.map((o) => (o.uid === id ? { ...o, values: o.values.map((v) => (v.uid === vid ? { ...v, ...p } : v)) } : o)));
  const addValues = (o: Option, raw: string[]) => {
    const have = new Set(o.values.map((v) => v.value.toLowerCase()));
    const fresh = raw
      .map((v) => v.trim().slice(0, OPTION_VALUE_MAX))
      .filter((v) => v && !have.has(v.toLowerCase()) && have.add(v.toLowerCase()))
      .map((value) => ({ uid: uid(), value, hex: null, image_url: null }));
    patch(o.uid, { values: [...o.values, ...fresh].slice(0, MAX_OPTION_VALUES), draft: "" });
  };
  const addOption = (kind: "colour" | "size" | "other") =>
    setOptions((os) => [...os, { uid: uid(), name: kind === "colour" ? t.colourName : kind === "size" ? t.sizeName : "", colour: kind === "colour", values: [], draft: "" }]);
  const cell = (c: Combination) => cells.get(combinationKey(c, defined)) ?? { stock: "", price: "0" };
  const setCell = (c: Combination, p: Partial<Cell>) => setCells((m) => new Map(m).set(combinationKey(c, defined), { ...cell(c), ...p }));
  const colourOption = defined.find((o) => o.colour);

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="options" value={JSON.stringify(defined)} />
      {defined.length ? (
        <input
          type="hidden"
          name="variants"
          value={JSON.stringify(rows.map((c) => ({ ...combinationNameValue(c, defined), options: c, stock_quantity: cell(c).stock, price_modifier: cell(c).price })))}
        />
      ) : null}

      {options.map((o) => (
        <fieldset key={o.uid} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border p-3" data-testid="product-option">
          <legend className="sr-only">{o.name || t.optionName}</legend>
          <div className="flex items-center gap-2">
            <input aria-label={t.optionName} placeholder={t.optionName} value={o.name} maxLength={OPTION_NAME_MAX} onChange={(e) => patch(o.uid, { name: e.target.value })} className={cn(input, "font-semibold")} />
            <Button type="button" variant="ghost" size="icon" aria-label={t.removeOption} className="size-10 shrink-0" onClick={() => setOptions((os) => os.filter((x) => x.uid !== o.uid))}>
              <X aria-hidden />
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-deep">
            <input
              type="checkbox"
              checked={o.colour}
              onChange={(e) => setOptions((os) => os.map((x) => (x.uid === o.uid ? { ...x, colour: e.target.checked } : e.target.checked ? { ...x, colour: false } : x)))}
              className="size-4 accent-waza-600"
            />
            {t.isColour}
          </label>

          {o.colour ? (
            <ul className="flex flex-col gap-2">
              {o.values.map((v) => (
                <li key={v.uid} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-2">
                  <Swatch hex={v.hex} label={format(t.swatch, { value: v.value })} onChange={(hex) => patchValue(o.uid, v.uid, { hex })} noSwatch={t.noSwatch} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-deep">{v.value}</span>
                  {v.image_url ? (
                    <span className="flex items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded image */}
                      <img src={v.image_url} alt={format(t.photo, { value: v.value })} className="size-10 rounded-lg border border-border object-cover" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => patchValue(o.uid, v.uid, { image_url: null })}>
                        {t.removePhoto}
                      </Button>
                    </span>
                  ) : null}
                  <input
                    type="file"
                    name={`colour_image__${v.value}`}
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={format(t.photo, { value: v.value })}
                    className="w-full max-w-60 text-xs text-slate file:mr-2 file:rounded-full file:border-0 file:bg-mint file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-deep"
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label={format(t.removeValue, { value: v.value })} className="size-9" onClick={() => patch(o.uid, { values: o.values.filter((x) => x.uid !== v.uid) })}>
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : o.values.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {o.values.map((v) => (
                <li key={v.uid} className="flex items-center gap-1 rounded-full border border-border bg-surface py-1 pr-1 pl-3 text-sm font-semibold text-deep">
                  {v.value}
                  <button type="button" aria-label={format(t.removeValue, { value: v.value })} onClick={() => patch(o.uid, { values: o.values.filter((x) => x.uid !== v.uid) })} className="grid size-6 place-items-center rounded-full text-slate hover:bg-mint hover:text-deep">
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <input
              aria-label={`${o.name || t.optionName}: ${t.newValue}`}
              placeholder={o.colour ? t.valuePlaceholder : t.sizePlaceholder}
              value={o.draft}
              maxLength={OPTION_VALUE_MAX}
              onChange={(e) => patch(o.uid, { draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addValues(o, o.draft.split(","));
                }
              }}
              className={cn(input, "w-auto flex-1 basis-40")}
            />
            <Button type="button" variant="secondary" size="sm" className="h-10" onClick={() => addValues(o, o.draft.split(","))}>
              <Plus aria-hidden /> {t.addValue}
            </Button>
            {!o.colour && !o.values.length ? (
              <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => addValues(o, SIZES)}>
                {t.quickSizes}
              </Button>
            ) : null}
          </div>
        </fieldset>
      ))}

      {optionsError ? (
        <p role="alert" className="text-xs font-medium text-coral-700">
          {optionsError}
        </p>
      ) : null}

      {options.length < MAX_OPTIONS ? (
        <div className="flex flex-wrap gap-2">
          {!options.some((o) => o.colour) ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => addOption("colour")}>
              <Plus aria-hidden /> {t.addColours}
            </Button>
          ) : null}
          {!options.some((o) => o.name.trim().toLowerCase() === t.sizeName.toLowerCase()) ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => addOption("size")}>
              <Plus aria-hidden /> {t.addSizes}
            </Button>
          ) : null}
          {options.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => addOption("other")}>
              <Plus aria-hidden /> {t.addOther}
            </Button>
          ) : null}
        </div>
      ) : null}
      {colourOption ? <p className="text-xs text-slate">{t.photoHint}</p> : null}

      {defined.length ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div>
            <h3 className="text-sm font-bold text-deep">{t.combinations}</h3>
            <p className="text-xs text-slate">{count > MAX_COMBINATIONS ? format(t.tooMany, { max: MAX_COMBINATIONS }) : format(t.combinationsCount, { count })}</p>
            {legacyCount ? <p className="mt-1 text-xs font-semibold text-amber-700">{format(t.replaceNote, { count: legacyCount })}</p> : null}
          </div>
          {rows.length ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate">
                  {t.allStock}
                  <input inputMode="numeric" value={allStock} onChange={(e) => setAllStock(e.target.value)} className={cn(input, "w-28")} />
                </label>
                <Button type="button" variant="secondary" size="sm" className="h-10" onClick={() => setCells((m) => new Map([...m, ...rows.map((c) => [combinationKey(c, defined), { ...cell(c), stock: allStock }] as const)]))}>
                  {t.apply}
                </Button>
              </div>
              <div className="flex flex-col gap-2" data-testid="combination-grid">
                <div className="hidden grid-cols-[1fr_6rem_7rem] gap-2 px-1 text-xs font-semibold text-slate sm:grid">
                  <span>{t.combination}</span>
                  <span>{t.stock}</span>
                  <span>{t.priceModifier}</span>
                </div>
                {rows.map((c) => {
                  const label = defined.map((o) => c[o.name]).join(" / ");
                  const hex = colourOption?.values.find((v) => v.value === c[colourOption.name])?.hex;
                  return (
                    <div key={combinationKey(c, defined)} className="grid grid-cols-2 items-center gap-2 rounded-2xl border border-border p-2 sm:grid-cols-[1fr_6rem_7rem] sm:border-0 sm:p-0">
                      <span className="col-span-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-deep sm:col-span-1">
                        {colourOption ? <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-border" style={{ background: hex ?? "transparent" }} /> : null}
                        <span className="truncate">{label}</span>
                      </span>
                      <input aria-label={`${label}: ${t.stock}`} inputMode="numeric" value={cell(c).stock} onChange={(e) => setCell(c, { stock: e.target.value })} className={input} />
                      <input aria-label={`${label}: ${t.priceModifier}`} inputMode="decimal" value={cell(c).price} onChange={(e) => setCell(c, { price: e.target.value })} className={input} />
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
          {variantsError ? (
            <p role="alert" className="text-xs font-medium text-coral-700">
              {variantsError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-bold text-deep">{t.otherVariants}</h3>
          <VariantsEditor t={tv} initial={legacy} />
        </div>
      )}
    </div>
  );
}

/** A colour swatch: the native colour picker, or "no swatch". */
function Swatch({ hex, label, noSwatch, onChange }: { hex: string | null; label: string; noSwatch: string; onChange: (hex: string | null) => void }) {
  return (
    <span className="flex items-center gap-1">
      <label className={cn("relative grid size-8 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border-2", hex ? "border-border" : "border-dashed border-slate/50")} style={{ background: hex ?? "transparent" }}>
        <span className="sr-only">{label}</span>
        <input type="color" value={hex ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      {hex ? (
        <button type="button" onClick={() => onChange(null)} className="text-[0.6875rem] text-slate underline hover:text-deep">
          {noSwatch}
        </button>
      ) : null}
    </span>
  );
}
