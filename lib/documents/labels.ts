import { currencyDigits } from "./calc";
import type { DocumentLanguage, DocumentType, ReceiptMethod } from "./types";

/*
 * Words printed ON a document, in the document's own language (which can differ
 * from the dashboard's). Add a language by adding one object.
 */
export type DocumentLabels = {
  title: Record<DocumentType, string>;
  to: Record<DocumentType, string>;
  from: string;
  number: string;
  date: string;
  dueDate: string;
  validUntil: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  amount: string;
  subtotal: string;
  tax: string;
  total: string;
  amountPaid: string;
  balance: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  terms: string;
  page: string;
  of: string;
  thanks: Record<DocumentType, string>;
  signature: string;
  stamp: string;
  draft: string;
  voided: string;
  paidInFull: string;
  /** Invoices with payments: paid so far. */
  paid: string;
  paidStamp: string;
  /** Linked documents (Phase 2). */
  forDoc: Record<"invoice" | "order", string>;
  docTotal: Record<"invoice" | "order", string>;
  orderRef: string;
  paidToDate: string;
  methods: Record<ReceiptMethod, string>;
  generatedWith: string;
  statement: StatementLabels;
};

/** A customer's statement of account. */
export type StatementLabels = {
  title: string;
  customer: string;
  period: string;
  allTime: string;
  issued: string;
  date: string;
  reference: string;
  description: string;
  charge: string;
  payment: string;
  balance: string;
  opening: string;
  closing: string;
  totalCharges: string;
  totalPayments: string;
  order: string;
  invoice: string;
  paymentFor: string;
  empty: string;
};

export const DOCUMENT_LABELS: Record<DocumentLanguage, DocumentLabels> = {
  en: {
    title: { invoice: "Invoice", receipt: "Receipt", quotation: "Quotation" },
    to: { invoice: "Bill to", receipt: "Received from", quotation: "Quotation for" },
    from: "From",
    number: "No.",
    date: "Date",
    dueDate: "Due date",
    validUntil: "Valid until",
    description: "Description",
    quantity: "Qty",
    unitPrice: "Unit price",
    discount: "Discount",
    amount: "Amount",
    subtotal: "Subtotal",
    tax: "Tax",
    total: "Total",
    amountPaid: "Amount received",
    balance: "Balance due",
    paymentMethod: "Payment method",
    paymentReference: "Reference",
    notes: "Notes",
    terms: "Terms and conditions",
    page: "Page",
    of: "of",
    thanks: { invoice: "Thank you for your business.", receipt: "Thank you for your payment.", quotation: "We look forward to working with you." },
    signature: "Signature",
    stamp: "Stamp",
    draft: "Draft",
    voided: "Void",
    paidInFull: "Paid in full",
    paid: "Paid",
    paidStamp: "Paid",
    forDoc: { invoice: "For invoice", order: "For order" },
    docTotal: { invoice: "Invoice total", order: "Order total" },
    orderRef: "Order",
    paidToDate: "Paid to date",
    methods: { cash: "Cash", mtn_momo: "MTN Mobile Money", orange_money: "Orange Money", mobile_money: "Mobile money", bank_transfer: "Bank transfer", card: "Card", cheque: "Cheque", other: "Other" },
    generatedWith: "Made with WazaBolt · wazabolt.com",
    statement: {
      title: "Statement of account",
      customer: "Customer",
      period: "Period",
      allTime: "All transactions",
      issued: "Issued on",
      date: "Date",
      reference: "Reference",
      description: "Description",
      charge: "Billed",
      payment: "Paid",
      balance: "Balance",
      opening: "Opening balance",
      closing: "Balance due",
      totalCharges: "Total billed",
      totalPayments: "Total paid",
      order: "Order",
      invoice: "Invoice",
      paymentFor: "Payment",
      empty: "No transactions in this period.",
    },
  },
  fr: {
    title: { invoice: "Facture", receipt: "Reçu", quotation: "Devis" },
    to: { invoice: "Facturé à", receipt: "Reçu de", quotation: "Devis pour" },
    from: "De",
    number: "N°",
    date: "Date",
    dueDate: "Échéance",
    validUntil: "Valable jusqu'au",
    description: "Désignation",
    quantity: "Qté",
    unitPrice: "Prix unitaire",
    discount: "Remise",
    amount: "Montant",
    subtotal: "Sous-total",
    tax: "Taxe",
    total: "Total",
    amountPaid: "Montant reçu",
    balance: "Reste à payer",
    paymentMethod: "Mode de paiement",
    paymentReference: "Référence",
    notes: "Notes",
    terms: "Conditions",
    page: "Page",
    of: "sur",
    thanks: { invoice: "Merci pour votre confiance.", receipt: "Merci pour votre paiement.", quotation: "Au plaisir de travailler avec vous." },
    signature: "Signature",
    stamp: "Cachet",
    draft: "Brouillon",
    voided: "Annulé",
    paidInFull: "Payé en totalité",
    paid: "Payé",
    paidStamp: "Payé",
    forDoc: { invoice: "Pour la facture", order: "Pour la commande" },
    docTotal: { invoice: "Total de la facture", order: "Total de la commande" },
    orderRef: "Commande",
    paidToDate: "Payé à ce jour",
    methods: { cash: "Espèces", mtn_momo: "MTN Mobile Money", orange_money: "Orange Money", mobile_money: "Mobile money", bank_transfer: "Virement bancaire", card: "Carte", cheque: "Chèque", other: "Autre" },
    generatedWith: "Réalisé avec WazaBolt · wazabolt.com",
    statement: {
      title: "Relevé de compte",
      customer: "Client",
      period: "Période",
      allTime: "Toutes les opérations",
      issued: "Établi le",
      date: "Date",
      reference: "Référence",
      description: "Libellé",
      charge: "Facturé",
      payment: "Payé",
      balance: "Solde",
      opening: "Solde d'ouverture",
      closing: "Solde dû",
      totalCharges: "Total facturé",
      totalPayments: "Total payé",
      order: "Commande",
      invoice: "Facture",
      paymentFor: "Paiement",
      empty: "Aucune opération sur cette période.",
    },
  },
};

/** "15 000 FCFA" / "15,000 FCFA" / "1,250.50 EUR". Plain spaces only (PDF fonts lack the narrow no-break space). */
export function formatDocMoney(amount: number, currency: string, language: DocumentLanguage): string {
  const digits = currencyDigits(currency);
  const n = new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  const label = currency === "XAF" || currency === "XOF" ? "FCFA" : currency;
  return `${n.replace(/[  ]/g, " ")} ${label}`;
}

/** Quantities: up to 3 decimals, no trailing zeros. */
export function formatQuantity(q: number, language: DocumentLanguage): string {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 3 }).format(q).replace(/[  ]/g, " ");
}

/** "2026-10-22" → "22 Oct 2026" / "22 oct. 2026" (no timezone shift: dates are calendar dates). */
export function formatDocDate(iso: string | null | undefined, language: DocumentLanguage): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
