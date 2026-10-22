import { formatDocDate } from "./labels";
import type { DocumentLabels } from "./labels";
import type { DocumentData, DocumentTotals } from "./types";

/*
 * What both renderers (PDF and on-screen preview) print around the lines:
 * the number/date block, the rows under the total, the linked document and
 * the stamp. One place, so the two never disagree.
 */

/** Number, date, due / valid-until date, and the linked order or invoice. */
export function metaRows(doc: DocumentData, L: DocumentLabels): [string, string][] {
  const rows: [string, string][] = [
    [L.number, doc.number ?? (doc.stamp === "draft" ? L.draft : "—")],
    [L.date, formatDocDate(doc.issueDate, doc.language)],
  ];
  if (doc.type === "invoice" && doc.dueDate) rows.push([L.dueDate, formatDocDate(doc.dueDate, doc.language)]);
  if (doc.type === "quotation" && doc.dueDate) rows.push([L.validUntil, formatDocDate(doc.dueDate, doc.language)]);
  if (doc.related?.number) rows.push([doc.type === "receipt" ? L.forDoc[doc.related.kind] : L.orderRef, doc.related.number]);
  return rows;
}

/** Rows under the total: amount received / paid so far, and the balance. */
export function paidRows(doc: DocumentData, t: DocumentTotals, L: DocumentLabels, money: (n: number) => string): [string, string][] {
  if (t.paid === null) return [];
  // A receipt for a payment on an invoice / order: the balance left on that document.
  const balance = doc.type === "receipt" && doc.related?.balance != null ? doc.related.balance : (t.balance ?? 0);
  return [
    [doc.type === "invoice" ? L.paid : L.amountPaid, money(t.paid)],
    [L.balance, money(balance)],
  ];
}

/** Receipts: the linked invoice / order's total and what was paid up to and including this payment. */
export function relatedRows(doc: DocumentData, L: DocumentLabels, money: (n: number) => string): [string, string][] {
  const r = doc.related;
  if (doc.type !== "receipt" || !r || r.total == null) return [];
  const rows: [string, string][] = [[L.docTotal[r.kind], money(r.total)]];
  if (r.paidToDate != null) rows.push([L.paidToDate, money(r.paidToDate)]);
  return rows;
}

/** "Paid in full" on a receipt: nothing left on the receipt, or on the invoice / order it pays. */
export function paidInFull(doc: DocumentData, t: DocumentTotals): boolean {
  if (doc.type !== "receipt") return false;
  return doc.related?.balance != null ? doc.related.balance === 0 : t.balance === 0;
}

export function stampWord(doc: DocumentData, L: DocumentLabels): string | null {
  if (doc.stamp === "draft") return L.draft;
  if (doc.stamp === "voided") return L.voided;
  if (doc.stamp === "paid") return L.paidStamp;
  return null;
}

export const STAMP_COLOURS = { draft: "#9aa5b1", voided: "#d9534f", paid: "#0c8354" } as const;
