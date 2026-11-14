import { describe, expect, it } from "vitest";

import { forbiddenProductFields, stockChangeAllowed } from "@/lib/auth/field-allowlist";

describe("catalog field allowlist", () => {
  it("lets owners and managers change any product field", () => {
    for (const role of ["owner", "manager"] as const) {
      expect(forbiddenProductFields(role, { price: 500, name: "Rice", active: false })).toEqual([]);
    }
  });

  it("lets staff change availability and stock only", () => {
    expect(forbiddenProductFields("staff", { active: false })).toEqual([]);
    expect(forbiddenProductFields("staff", { stock_quantity: 4 })).toEqual([]);
    expect(forbiddenProductFields("staff", { active: true, price: 100, name: "x", description: "y" })).toEqual(["price", "name", "description"]);
    // Fields not being changed are not counted.
    expect(forbiddenProductFields("staff", { active: true, price: undefined })).toEqual([]);
  });

  it("lets staff record a stock count, never stock in, losses or a plain quantity", () => {
    expect(stockChangeAllowed("staff", { reason: "adjustment", counted: 12, quantity: null })).toBe(true);
    expect(stockChangeAllowed("staff", { reason: "adjustment", counted: 0 })).toBe(true);
    expect(stockChangeAllowed("staff", { reason: "adjustment", counted: null, quantity: 5 })).toBe(false);
    for (const reason of ["purchase", "return", "damaged", "lost", "opening"]) {
      expect(stockChangeAllowed("staff", { reason, quantity: 3, counted: null })).toBe(false);
    }
    expect(stockChangeAllowed("manager", { reason: "purchase", quantity: 3 })).toBe(true);
    expect(stockChangeAllowed("owner", { reason: "lost", quantity: 1 })).toBe(true);
  });
});
