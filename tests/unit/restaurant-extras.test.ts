import { describe, expect, it } from "vitest";

import { extrasLabel, linePrice, parseExtras } from "@/lib/restaurant/extras";
import { productSchema } from "@/lib/validation/app";

describe("dish extras", () => {
  it("reads extras from the database loosely and prices a line", () => {
    const extras = parseExtras([{ name: "Plantain frit", price: 500 }, { name: "Piment", price: 0 }, { bad: true }, "x"]);
    expect(extras).toEqual([
      { name: "Plantain frit", price: 500 },
      { name: "Piment", price: 0 },
    ]);
    expect(parseExtras(null)).toEqual([]);
    expect(linePrice(5000, extras)).toBe(5500);
    expect(extrasLabel(extras)).toBe("Plantain frit, Piment");
  });

  it("the product form keeps extras when it doesn't show them, and checks them when it does", () => {
    const base = { name: "Poulet DG", price: "5000", options: "[]", variants: "[]" };
    expect(productSchema.safeParse(base).success && (productSchema.parse(base) as { extras?: unknown }).extras).toBe(undefined);
    expect(productSchema.parse({ ...base, extras: JSON.stringify([{ name: " Plantain ", price: 500 }]) }).extras).toEqual([{ name: "Plantain", price: 500 }]);
    expect(productSchema.safeParse({ ...base, extras: JSON.stringify([{ name: "A", price: -1 }]) }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, extras: JSON.stringify([{ name: "A", price: 1 }, { name: "a", price: 2 }]) }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, extras: JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ name: `E${i}`, price: 0 }))) }).success).toBe(false);
  });
});
