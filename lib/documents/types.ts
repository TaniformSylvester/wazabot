/*
 * WazaBolt Docs — the one document model shared by the guest generator, the
 * dashboard and (later) the WhatsApp assistant. Everything a template needs is
 * in DocumentData; totals always come from computeTotals() (lib/documents/calc.ts).
 */

export const DOCUMENT_TYPES = ["invoice", "receipt", "quotation"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TEMPLATES = ["classic", "modern", "minimal"] as const;
export type DocumentTemplate = (typeof DOCUMENT_TEMPLATES)[number];

export const DOCUMENT_LANGUAGES = ["en", "fr"] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];

/** Currencies a document can be written in (XAF first). Amounts are stored in major units. */
export const DOCUMENT_CURRENCIES = ["XAF", "XOF", "NGN", "EUR", "USD", "GBP"] as const;
export type DocumentCurrency = (typeof DOCUMENT_CURRENCIES)[number];

export const RECEIPT_METHODS = ["cash", "mtn_momo", "orange_money", "mobile_money", "bank_transfer", "card", "cheque", "other"] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];

export const INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "voided"] as const;
export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected", "voided"] as const;
export const RECEIPT_STATUSES = ["draft", "issued", "voided"] as const;
export const DOCUMENT_STATUSES = ["draft", "issued", "sent", "accepted", "rejected", "partially_paid", "paid", "voided"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type DocumentParty = {
  name: string;
  /** e.g. the WazaBolt customer reference CUS-000012, or a tax number for a business. */
  reference?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

export type DocumentLine = {
  description: string;
  details?: string | null;
  quantity: number;
  unitPrice: number;
  /** 0–100, applied to this line. */
  discountPercent?: number;
  /** Where the line came from in the catalog (business documents only; informational). */
  productId?: string | null;
  variantId?: string | null;
  serviceId?: string | null;
};

export type DocumentPayment = {
  method: ReceiptMethod;
  reference?: string | null;
  /** Amount received with this receipt (major units). */
  amountPaid: number;
};

/**
 * What a business document says about the document it's linked to (saved with
 * the snapshot): an order's invoice names the order; a receipt for a recorded
 * payment names the invoice / order, its total, what was paid up to and
 * including this payment, and what is left.
 */
export type DocumentRelated = {
  kind: "invoice" | "order";
  number: string;
  total?: number | null;
  paidToDate?: number | null;
  balance?: number | null;
};

export type DocumentData = {
  type: DocumentType;
  template: DocumentTemplate;
  language: DocumentLanguage;
  currency: DocumentCurrency;
  /** Null for drafts and guest documents without a number. */
  number: string | null;
  issueDate: string;
  /** Invoice: due date. Quotation: valid until. Receipt: unused. */
  dueDate?: string | null;
  business: DocumentParty;
  customer: DocumentParty;
  items: DocumentLine[];
  /** Amount off the subtotal (major units). */
  discount?: number;
  /** Percent, applied after the discount. */
  taxRate?: number;
  taxLabel?: string | null;
  notes?: string | null;
  terms?: string | null;
  /** Receipts only. */
  payment?: DocumentPayment | null;
  /** Invoices: what has been paid so far (recorded payments). Shown with the balance when more than 0. */
  invoicePaid?: number | null;
  related?: DocumentRelated | null;
  /** Shown as a stamp: drafts, voided documents and paid invoices. */
  stamp?: "draft" | "voided" | "paid" | null;
};

export type ComputedLine = { gross: number; discount: number; total: number };
export type DocumentTotals = {
  lines: ComputedLine[];
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  /** Receipts: amount received and what remains. Invoices: paid so far and the balance (null when nothing is paid). */
  paid: number | null;
  balance: number | null;
};
