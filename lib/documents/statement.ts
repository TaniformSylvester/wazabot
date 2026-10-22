import { currencyDigits } from "./calc";
import type { DocumentCurrency, DocumentLanguage, DocumentParty, DocumentTemplate } from "./types";

/*
 * A customer's statement of account: what was billed (orders, invoices) and
 * what was paid, in date order, with a running balance. Before the period:
 * one opening balance. Pure (no I/O) so it's tested directly; the dashboard
 * collects the entries (lib/data/statements.ts) and the PDF engine prints it.
 */

export type StatementEntry = {
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  /** Orders on the same date before payments, then by this key (time, number). */
  sortKey: string;
  kind: "order" | "invoice" | "payment";
  reference: string;
  description: string;
  /** Billed (major units). */
  charge: number;
  /** Paid (major units). */
  payment: number;
};

export type StatementLine = StatementEntry & { balance: number };

export type StatementData = {
  language: DocumentLanguage;
  currency: DocumentCurrency;
  template: DocumentTemplate;
  business: DocumentParty;
  customer: DocumentParty;
  /** Null = from the first transaction. */
  from: string | null;
  to: string;
  issuedOn: string;
  opening: number;
  lines: StatementLine[];
  totalCharges: number;
  totalPayments: number;
  closing: number;
};

const order = (e: StatementEntry) => `${e.date}|${e.kind === "payment" ? 1 : 0}|${e.sortKey}`;

export function buildStatement(
  entries: StatementEntry[],
  p: Omit<StatementData, "opening" | "lines" | "totalCharges" | "totalPayments" | "closing">,
): StatementData {
  const f = 10 ** currencyDigits(p.currency);
  const minor = (v: number) => Math.round(Number((v * f).toPrecision(15)));
  const sorted = entries.filter((e) => e.date <= p.to).sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  let opening = 0;
  let running = 0;
  let charges = 0;
  let payments = 0;
  const lines: StatementLine[] = [];
  for (const e of sorted) {
    const delta = minor(e.charge) - minor(e.payment);
    if (p.from && e.date < p.from) {
      opening += delta;
      running += delta;
      continue;
    }
    running += delta;
    charges += minor(e.charge);
    payments += minor(e.payment);
    lines.push({ ...e, balance: running / f });
  }
  return { ...p, opening: opening / f, lines, totalCharges: charges / f, totalPayments: payments / f, closing: running / f };
}
