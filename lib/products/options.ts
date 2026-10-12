/*
 * Product options (Colour, Size …) and their combinations. Pure helpers shared
 * by the product form, the till, the order form, the assistant and tests.
 *
 * products.options:          [{ name: "Colour", colour: true, values: [{ value: "Red", hex: "#D62828", image_url }] }, { name: "Size", values: [{ value: "M" }] }]
 * product_variants.options:  { Colour: "Red", Size: "M" }   (null for single-option variants made before options existed)
 */

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 20;
export const MAX_COMBINATIONS = 100;
export const OPTION_NAME_MAX = 18;
export const OPTION_VALUE_MAX = 24;

export type OptionValue = { value: string; hex?: string | null; image_url?: string | null };
export type ProductOption = { name: string; colour?: boolean; values: OptionValue[] };
export type Combination = Record<string, string>;

/** The stored jsonb, read defensively. */
export function parseOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const { name, colour, values } = o as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || !Array.isArray(values)) continue;
    const vals: OptionValue[] = [];
    for (const v of values) {
      if (!v || typeof v !== "object") continue;
      const r = v as Record<string, unknown>;
      if (typeof r.value !== "string" || !r.value.trim()) continue;
      vals.push({ value: r.value, hex: typeof r.hex === "string" ? r.hex : null, image_url: typeof r.image_url === "string" ? r.image_url : null });
    }
    if (vals.length) out.push({ name, colour: colour === true, values: vals });
  }
  return out.slice(0, MAX_OPTIONS);
}

export function parseCombination(raw: unknown): Combination | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Combination = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** Every combination of the option values, in option order (Red/S, Red/M, …, Blue/S …). */
export function combinations(options: ProductOption[]): Combination[] {
  if (!options.length) return [];
  let out: Combination[] = [{}];
  for (const o of options) out = out.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v.value })));
  return out;
}

export function combinationCount(options: ProductOption[]) {
  return options.length ? options.reduce((n, o) => n * o.values.length, 1) : 0;
}

/** A stable key for a combination (option order, case-insensitive). */
export function combinationKey(c: Combination, options: ProductOption[]) {
  return options.map((o) => (c[o.name] ?? "").trim().toLowerCase()).join("\u0001");
}

/** "Colour: Red · Size: M" */
export function combinationLabel(c: Combination, options: ProductOption[]) {
  return options
    .filter((o) => c[o.name] !== undefined)
    .map((o) => `${o.name}: ${c[o.name]}`)
    .join(" · ");
}

/** The legacy name/value columns, kept filled for combinations: "Colour / Size", "Red / M". */
export function combinationNameValue(c: Combination, options: ProductOption[]) {
  return { name: options.map((o) => o.name).join(" / "), value: options.map((o) => c[o.name]).join(" / ") };
}

type VariantLike = { name: string; value: string; options?: unknown };

/** A variant's label: "Colour: Red · Size: M" for combinations, "Size: L" for older single-option variants. */
export function variantLabel(v: VariantLike, options: ProductOption[] | unknown) {
  const opts = Array.isArray(options) && options.every((o) => o && typeof o === "object" && "values" in o) ? (options as ProductOption[]) : parseOptions(options);
  const c = parseCombination(v.options);
  return c && opts.length ? combinationLabel(c, opts) : `${v.name}: ${v.value}`;
}

/** The colour option's value for this combination, with its swatch and photo. */
export function colourOf(c: Combination | null, options: ProductOption[]): OptionValue | null {
  const o = options.find((x) => x.colour);
  if (!o || !c) return null;
  return o.values.find((v) => v.value === c[o.name]) ?? null;
}

export type PickVariant = { id: string; options?: unknown; stock_quantity: number | null; price_modifier: number };

/** Can this variant be sold now? Untracked variant stock falls back to the product's (same rule as the database). */
export function variantAvailable(v: Pick<PickVariant, "stock_quantity">, productStock: number | null) {
  return v.stock_quantity !== null ? v.stock_quantity > 0 : productStock === null || productStock > 0;
}

/**
 * For a partial choice (e.g. { Size: "M" }): for each option, which values still
 * lead to a variant in stock (given the other options already chosen).
 */
export function availableValues(options: ProductOption[], variants: PickVariant[], productStock: number | null, chosen: Combination) {
  const rows = variants.map((v) => ({ c: parseCombination(v.options), ok: variantAvailable(v, productStock) })).filter((r) => r.c && r.ok) as { c: Combination }[];
  const out: Record<string, Set<string>> = {};
  for (const o of options) {
    const others = Object.entries(chosen).filter(([k]) => k !== o.name);
    out[o.name] = new Set(rows.filter((r) => others.every(([k, val]) => r.c[k] === val)).map((r) => r.c[o.name]));
  }
  return out;
}

/** The variant for a complete choice, or null. */
export function findVariant<V extends PickVariant>(options: ProductOption[], variants: V[], chosen: Combination): V | null {
  if (options.some((o) => chosen[o.name] === undefined)) return null;
  const key = combinationKey(chosen, options);
  return variants.find((v) => {
    const c = parseCombination(v.options);
    return c !== null && combinationKey(c, options) === key;
  }) ?? null;
}

/** True when the product sells by option combinations (rather than older single-option variants). */
export function usesOptions(options: ProductOption[], variants: { options?: unknown }[]) {
  return options.length > 0 && variants.some((v) => parseCombination(v.options) !== null);
}
