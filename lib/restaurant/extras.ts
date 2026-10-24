/*
 * Dish extras (Restaurant module): optional add-ons a customer can pick, each
 * with a price (0 when free), e.g. "Fried plantain" 500. Stored on the
 * product as [{ name, price }]; an order line keeps the ones chosen. The
 * database checks the same shape (valid_extras).
 */
export type Extra = { name: string; price: number };

export const MAX_EXTRAS = 20;
export const EXTRA_NAME_MAX = 60;

/** Extras read back from the database (shape checked loosely: it was validated on save). */
export function parseExtras(value: unknown): Extra[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e) =>
    e && typeof e === "object" && typeof (e as Extra).name === "string" && typeof (e as Extra).price === "number" ? [{ name: (e as Extra).name, price: (e as Extra).price }] : [],
  );
}

/** A line's unit price: the dish (with its variant) plus the extras chosen. */
export function linePrice(base: number, extras: Extra[]): number {
  return extras.reduce((sum, e) => sum + e.price, base);
}

/** "Fried plantain, Pepper" — for tickets and bills. */
export function extrasLabel(extras: Extra[]): string {
  return extras.map((e) => e.name).join(", ");
}
