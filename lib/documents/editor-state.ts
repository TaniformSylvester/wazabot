import { computeTotals } from "./calc";
import type { DocumentCurrency, DocumentData, DocumentLanguage, DocumentTemplate, DocumentType, ReceiptMethod } from "./types";

/*
 * The document form's state (text fields as typed) and its conversion to a
 * DocumentData. Plain module: used by the editor (client) and by pages that
 * prepare its initial state (server).
 */

export type LineState = { key: number; description: string; details: string; quantity: string; unitPrice: string; discountPercent: string; productId?: string | null; variantId?: string | null; serviceId?: string | null };
export type Party = { name: string; reference: string; address: string; phone: string; email: string; website: string };
export type EditorState = {
  type: DocumentType;
  template: DocumentTemplate;
  language: DocumentLanguage;
  currency: DocumentCurrency;
  number: string;
  issueDate: string;
  dueDate: string;
  business: Party;
  customer: Party;
  customerId: string | null;
  items: LineState[];
  discount: string;
  taxRate: string;
  taxLabel: string;
  notes: string;
  terms: string;
  payment: { method: ReceiptMethod; reference: string; amountPaid: string };
};

export type CustomerChoice = { id: string; name: string; reference: string; phone: string | null; email: string | null; address: string | null };
export type CatalogChoice = { key: string; label: string; unitPrice: number; productId?: string; variantId?: string; serviceId?: string };
export type SubmitResult = { ok: true; id: string } | { ok: false; error: string; issues?: { path: string; message: string }[] };

export const emptyParty: Party = { name: "", reference: "", address: "", phone: "", email: "", website: "" };
export const emptyLine = (key: number): LineState => ({ key, description: "", details: "", quantity: "1", unitPrice: "", discountPercent: "" });
export const num = (v: string) => {
  const n = Number(String(v).replace(/[\s  ,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

export function newEditorState(over: Partial<EditorState> = {}): EditorState {
  const issue = today();
  return {
    type: "invoice",
    template: "modern",
    language: "fr",
    currency: "XAF",
    number: "",
    issueDate: issue,
    dueDate: addDays(issue, 14),
    business: { ...emptyParty },
    customer: { ...emptyParty },
    customerId: null,
    items: [emptyLine(1)],
    discount: "",
    taxRate: "",
    taxLabel: "",
    notes: "",
    terms: "",
    payment: { method: "cash", reference: "", amountPaid: "" },
    ...over,
  };
}

const opt = (s: string) => (s.trim() ? s.trim() : null);
/** The editor's text fields → the document the engine, the preview and the server use. */
export function toDocument(s: EditorState, stamp: DocumentData["stamp"] = null): DocumentData {
  const party = (p: Party) => ({ name: p.name.trim(), reference: opt(p.reference), address: opt(p.address), phone: opt(p.phone), email: opt(p.email), website: opt(p.website) });
  const doc: DocumentData = {
    type: s.type,
    template: s.template,
    language: s.language,
    currency: s.currency,
    number: opt(s.number),
    issueDate: s.issueDate,
    dueDate: s.type === "receipt" ? null : opt(s.dueDate),
    business: party(s.business),
    customer: party(s.customer),
    items: s.items.map((i) => ({
      description: i.description.trim(),
      details: opt(i.details),
      quantity: num(i.quantity),
      unitPrice: num(i.unitPrice),
      discountPercent: num(i.discountPercent),
      productId: i.productId ?? null,
      variantId: i.variantId ?? null,
      serviceId: i.serviceId ?? null,
    })),
    discount: num(s.discount),
    taxRate: num(s.taxRate),
    taxLabel: opt(s.taxLabel),
    notes: opt(s.notes),
    terms: opt(s.terms),
    payment: null,
    stamp,
  };
  if (s.type === "receipt") {
    const total = computeTotals({ ...doc, type: "invoice" }).total;
    doc.payment = { method: s.payment.method, reference: opt(s.payment.reference), amountPaid: s.payment.amountPaid.trim() ? num(s.payment.amountPaid) : total };
  }
  return doc;
}


/** A saved document (draft) → the editor's text fields. */
export function stateFromDocument(d: DocumentData, customerId: string | null): EditorState {
  const party = (p: DocumentData["business"]): Party => ({ name: p.name, reference: p.reference ?? "", address: p.address ?? "", phone: p.phone ?? "", email: p.email ?? "", website: p.website ?? "" });
  return {
    type: d.type,
    template: d.template,
    language: d.language,
    currency: d.currency,
    number: d.number ?? "",
    issueDate: d.issueDate,
    dueDate: d.dueDate ?? "",
    business: party(d.business),
    customer: party(d.customer),
    customerId,
    items: d.items.map((i, n) => ({
      key: n + 1,
      description: i.description,
      details: i.details ?? "",
      quantity: String(i.quantity),
      unitPrice: String(i.unitPrice),
      discountPercent: i.discountPercent ? String(i.discountPercent) : "",
      productId: i.productId ?? null,
      variantId: i.variantId ?? null,
      serviceId: i.serviceId ?? null,
    })),
    discount: d.discount ? String(d.discount) : "",
    taxRate: d.taxRate ? String(d.taxRate) : "",
    taxLabel: d.taxLabel ?? "",
    notes: d.notes ?? "",
    terms: d.terms ?? "",
    payment: { method: d.payment?.method ?? "cash", reference: d.payment?.reference ?? "", amountPaid: d.payment ? String(d.payment.amountPaid) : "" },
  };
}
