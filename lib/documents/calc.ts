import type { ComputedLine, DocumentData, DocumentTotals } from "./types";

/*
 * Document totals. Amounts are computed in whole minor units of the currency
 * (FCFA has none, EUR/USD have 2) and rounded half away from zero, once per
 * line and once for the tax, so the preview, the PDF and the database always
 * agree. Order: line totals → subtotal → document discount → tax → total.
 */

/** Minor-unit digits: CFA francs and naira are written without decimals. */
export function currencyDigits(currency: string): number {
  return currency === "XAF" || currency === "XOF" || currency === "NGN" ? 0 : 2;
}

/** Half away from zero, at the currency's precision. Avoids 1.005 → 1.00 float errors. */
export function roundMoney(value: number, currency: string): number {
  const f = 10 ** currencyDigits(currency);
  const scaled = Math.abs(value) * f;
  const rounded = Math.round(Number(scaled.toPrecision(15)));
  return (Math.sign(value) * rounded) / f;
}

const toMinor = (v: number, digits: number) => Math.round(Number((v * 10 ** digits).toPrecision(15)));
const halfUp = (v: number) => Math.sign(v) * Math.round(Number(Math.abs(v).toPrecision(15)));

export function computeTotals(doc: Pick<DocumentData, "items" | "discount" | "taxRate" | "currency" | "type" | "payment">): DocumentTotals {
  const d = currencyDigits(doc.currency);
  const f = 10 ** d;
  const lines: ComputedLine[] = doc.items.map((it) => {
    // quantity × unit price, in minor units (quantity may have up to 3 decimals).
    const gross = halfUp(it.quantity * toMinor(it.unitPrice, d));
    const pct = Math.min(100, Math.max(0, it.discountPercent ?? 0));
    const discount = halfUp((gross * pct) / 100);
    return { gross, discount, total: gross - discount };
  });
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const discount = Math.min(subtotal, Math.max(0, toMinor(doc.discount ?? 0, d)));
  const taxable = subtotal - discount;
  const rate = Math.min(100, Math.max(0, doc.taxRate ?? 0));
  const tax = halfUp((taxable * rate) / 100);
  const total = taxable + tax;
  const paid = doc.type === "receipt" ? Math.max(0, toMinor(doc.payment?.amountPaid ?? total / f, d)) : null;
  const major = (v: number) => v / f;
  return {
    lines: lines.map((l) => ({ gross: major(l.gross), discount: major(l.discount), total: major(l.total) })),
    subtotal: major(subtotal),
    discount: major(discount),
    taxable: major(taxable),
    tax: major(tax),
    total: major(total),
    paid: paid === null ? null : major(paid),
    balance: paid === null ? null : major(Math.max(0, total - paid)),
  };
}
