import { describe, expect, it } from "vitest";

import {
  availableValues,
  colourOf,
  combinationLabel,
  combinationNameValue,
  combinations,
  findVariant,
  parseOptions,
  usesOptions,
  variantLabel,
  type ProductOption,
} from "@/lib/products/options";
import { productSchema } from "@/lib/validation/app";

const OPTIONS: ProductOption[] = [
  { name: "Colour", colour: true, values: [{ value: "Red", hex: "#D62828", image_url: "https://x/red.jpg" }, { value: "Blue", hex: "#1D4ED8" }, { value: "Black" }] },
  { name: "Size", values: [{ value: "S" }, { value: "M" }, { value: "L" }] },
];

// Red: S, M in stock; L sold out. Blue: only M. Black: untracked (follows the product's stock).
const VARIANTS = [
  { id: "r-s", options: { Colour: "Red", Size: "S" }, stock_quantity: 2, price_modifier: 0 },
  { id: "r-m", options: { Colour: "Red", Size: "M" }, stock_quantity: 1, price_modifier: 0 },
  { id: "r-l", options: { Colour: "Red", Size: "L" }, stock_quantity: 0, price_modifier: 500 },
  { id: "b-s", options: { Colour: "Blue", Size: "S" }, stock_quantity: 0, price_modifier: 0 },
  { id: "b-m", options: { Colour: "Blue", Size: "M" }, stock_quantity: 4, price_modifier: 0 },
  { id: "b-l", options: { Colour: "Blue", Size: "L" }, stock_quantity: 0, price_modifier: 0 },
  { id: "k-s", options: { Colour: "Black", Size: "S" }, stock_quantity: null, price_modifier: 0 },
  { id: "k-m", options: { Colour: "Black", Size: "M" }, stock_quantity: null, price_modifier: 0 },
  { id: "k-l", options: { Colour: "Black", Size: "L" }, stock_quantity: null, price_modifier: 0 },
];

describe("product options", () => {
  it("makes every combination in option order", () => {
    const all = combinations(OPTIONS);
    expect(all).toHaveLength(9);
    expect(all[0]).toEqual({ Colour: "Red", Size: "S" });
    expect(all[3]).toEqual({ Colour: "Blue", Size: "S" });
  });

  it("labels combinations in the product's option order", () => {
    // jsonb doesn't keep key order: the label follows the options, not the object.
    expect(combinationLabel({ Size: "M", Colour: "Red" }, OPTIONS)).toBe("Colour: Red · Size: M");
    expect(combinationNameValue({ Size: "M", Colour: "Red" }, OPTIONS)).toEqual({ name: "Colour / Size", value: "Red / M" });
    expect(variantLabel({ name: "Colour / Size", value: "Red / M", options: { Size: "M", Colour: "Red" } }, OPTIONS)).toBe("Colour: Red · Size: M");
    // Older single-option variants keep "Name: Value".
    expect(variantLabel({ name: "Size", value: "L", options: null }, [])).toBe("Size: L");
  });

  it("answers 'which colours in size M?' from stock", () => {
    const inM = availableValues(OPTIONS, VARIANTS, null, { Size: "M" }).Colour;
    expect([...inM].sort()).toEqual(["Black", "Blue", "Red"]);
    const inL = availableValues(OPTIONS, VARIANTS, null, { Size: "L" }).Colour;
    expect([...inL]).toEqual(["Black"]);
    const redSizes = availableValues(OPTIONS, VARIANTS, null, { Colour: "Red" }).Size;
    expect([...redSizes].sort()).toEqual(["M", "S"]);
  });

  it("untracked combinations follow the product's stock", () => {
    const blackWhenProductOut = availableValues(OPTIONS, VARIANTS, 0, { Colour: "Black" }).Size;
    expect(blackWhenProductOut.size).toBe(0);
  });

  it("finds the exact combination", () => {
    expect(findVariant(OPTIONS, VARIANTS, { Colour: "Blue", Size: "M" })?.id).toBe("b-m");
    expect(findVariant(OPTIONS, VARIANTS, { Colour: "Blue" })).toBeNull();
    expect(colourOf({ Colour: "Red", Size: "S" }, OPTIONS)?.image_url).toBe("https://x/red.jpg");
    expect(usesOptions(OPTIONS, VARIANTS)).toBe(true);
    expect(usesOptions(OPTIONS, [{ options: null }])).toBe(false);
  });

  it("reads stored options defensively", () => {
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions([{ name: "Size", values: [{ value: "M" }, { nope: 1 }] }, { name: "", values: [] }, "x"])).toEqual([
      { name: "Size", colour: false, values: [{ value: "M", hex: null, image_url: null }] },
    ]);
  });
});

describe("productSchema with options", () => {
  const base = { name: "T-shirt", price: "5000", unit: "piece", low_stock_threshold: "5" };
  const grid = combinations(OPTIONS).map((c) => ({ ...combinationNameValue(c, OPTIONS), options: c, stock_quantity: "3", price_modifier: "0" }));

  it("accepts options with their full grid", () => {
    const r = productSchema.safeParse({ ...base, options: JSON.stringify(OPTIONS), variants: JSON.stringify(grid) });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.options[0].colour).toBe(true);
      expect(r.data.options[1].colour).toBe(false);
      expect(r.data.variants[0].stock_quantity).toBe(3);
    }
  });

  it("still accepts older one-option variants", () => {
    const r = productSchema.safeParse({ ...base, variants: JSON.stringify([{ name: "Size", value: "L", stock_quantity: "", price_modifier: "0" }]) });
    expect(r.success).toBe(true);
  });

  it("refuses repeated values, unknown combinations and duplicates", () => {
    const dup = [{ ...OPTIONS[1], values: [{ value: "M" }, { value: "m" }] }];
    expect(productSchema.safeParse({ ...base, options: JSON.stringify(dup), variants: "[]" }).error?.issues[0].message).toBe("options_duplicate");
    const twoColours = [OPTIONS[0], { ...OPTIONS[1], colour: true }];
    expect(productSchema.safeParse({ ...base, options: JSON.stringify(twoColours), variants: "[]" }).error?.issues[0].message).toBe("options_duplicate");
    const unknown = [...grid, { ...grid[0], options: { Colour: "Green", Size: "S" } }];
    expect(productSchema.safeParse({ ...base, options: JSON.stringify(OPTIONS), variants: JSON.stringify(unknown) }).error?.issues[0].message).toBe("options_mismatch");
    const twice = [...grid, grid[0]];
    expect(productSchema.safeParse({ ...base, options: JSON.stringify(OPTIONS), variants: JSON.stringify(twice) }).error?.issues[0].message).toBe("options_mismatch");
  });

  it("refuses more than 100 combinations", () => {
    const many = [
      { name: "A", values: Array.from({ length: 11 }, (_, i) => ({ value: `a${i}` })) },
      { name: "B", values: Array.from({ length: 10 }, (_, i) => ({ value: `b${i}` })) },
    ];
    expect(productSchema.safeParse({ ...base, options: JSON.stringify(many), variants: "[]" }).error?.issues[0].message).toBe("options_too_many");
  });

  it("refuses a bad swatch colour", () => {
    const bad = [{ name: "Colour", colour: true, values: [{ value: "Red", hex: "red" }] }];
    expect(productSchema.safeParse({ ...base, options: JSON.stringify(bad), variants: "[]" }).success).toBe(false);
  });
});
