import "server-only";

import type { CatalogChoice, CustomerChoice } from "@/lib/documents/editor-state";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, type DocumentData, type DocumentLine, type DocumentRelated, type DocumentStatus, type DocumentType, type ReceiptMethod } from "@/lib/documents/types";
import { parseOptions, variantLabel } from "@/lib/products/options";
import type { CurrentBusiness } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { windowOpen } from "@/lib/whatsapp/service";
import type { Tables } from "@/types/database";

/*
 * WazaBolt Docs — reads for the dashboard (user's session: RLS keeps every
 * business to its own documents).
 */

export type DocumentRow = Tables<"documents">;
export type DocumentSettings = {
  invoice_prefix: string;
  receipt_prefix: string;
  quotation_prefix: string;
  include_year: boolean;
  number_padding: number;
  default_template: "classic" | "modern" | "minimal";
  default_language: "en" | "fr" | null;
  default_due_days: number;
  default_tax_rate: number;
  default_tax_label: string | null;
  default_notes: string | null;
  default_terms: string | null;
  business_reference: string | null;
};

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  invoice_prefix: "INV",
  receipt_prefix: "REC",
  quotation_prefix: "QUO",
  include_year: true,
  number_padding: 6,
  default_template: "modern",
  default_language: null,
  default_due_days: 14,
  default_tax_rate: 0,
  default_tax_label: null,
  default_notes: null,
  default_terms: null,
  business_reference: null,
};

export async function getDocumentSettings(businessId: string): Promise<DocumentSettings> {
  const db = await createClient();
  const { data } = await db.from("document_settings").select("*").eq("business_id", businessId).maybeSingle();
  if (!data) return DEFAULT_DOCUMENT_SETTINGS;
  return {
    ...DEFAULT_DOCUMENT_SETTINGS,
    ...data,
    default_template: (["classic", "modern", "minimal"] as const).find((x) => x === data.default_template) ?? "modern",
    default_language: data.default_language === "en" || data.default_language === "fr" ? data.default_language : null,
    default_tax_rate: Number(data.default_tax_rate),
  };
}

/** The business as printed on its documents: from the business profile (never from the browser) plus the NIU / RCCM set in Documents settings. */
export function businessSnapshot(b: Pick<CurrentBusiness, "name" | "address" | "city" | "phone" | "email" | "website">, settings: Pick<DocumentSettings, "business_reference">) {
  return {
    name: b.name,
    reference: settings.business_reference,
    address: [b.address, b.city].filter(Boolean).join(", ") || null,
    phone: b.phone,
    email: b.email,
    website: b.website,
  };
}

/** The document language for a business: the documents setting, else the business's language when it is French or English. */
export function documentLanguage(settings: Pick<DocumentSettings, "default_language">, business: Pick<CurrentBusiness, "defaultLanguage">, preferred?: string | null): "en" | "fr" {
  if (preferred === "en" || preferred === "fr") return preferred;
  return settings.default_language ?? (business.defaultLanguage === "fr" ? "fr" : "en");
}

export type DocumentFilter = { q?: string; type?: string; status?: string; customerId?: string; page?: number };
export const DOCUMENTS_PAGE_SIZE = 25;

export async function listDocuments(businessId: string, f: DocumentFilter = {}) {
  const db = await createClient();
  let q = db
    .from("documents")
    .select("id, doc_type, status, number, issue_date, due_date, total, currency, customer_id, customer_snapshot, created_at, voided_at", { count: "exact" })
    .eq("business_id", businessId);
  if (f.type && (DOCUMENT_TYPES as readonly string[]).includes(f.type)) q = q.eq("doc_type", f.type);
  if (f.status && (DOCUMENT_STATUSES as readonly string[]).includes(f.status)) q = q.eq("status", f.status);
  if (f.customerId) q = q.eq("customer_id", f.customerId);
  const term = f.q?.trim().replace(/[%_,()*\\]/g, " ").trim();
  if (term) q = q.or(`number.ilike.%${term}%,customer_snapshot->>name.ilike.%${term}%`);
  const page = Math.max(1, f.page ?? 1);
  const { data, count } = await q
    .order("created_at", { ascending: false })
    .range((page - 1) * DOCUMENTS_PAGE_SIZE, page * DOCUMENTS_PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0, page };
}

export async function getDocument(businessId: string, id: string) {
  const db = await createClient();
  const { data } = await db.from("documents").select("*").eq("business_id", businessId).eq("id", id).maybeSingle();
  return data;
}

/** Overdue invoices and expired quotations are shown as such; the stored status doesn't change by itself. */
export function displayStatus(row: Pick<DocumentRow, "doc_type" | "status" | "due_date">, today = new Date().toISOString().slice(0, 10)): DocumentStatus | "overdue" | "expired" {
  if (row.doc_type === "invoice" && (row.status === "issued" || row.status === "partially_paid") && row.due_date && row.due_date < today) return "overdue";
  if (row.doc_type === "quotation" && row.status === "sent" && row.due_date && row.due_date < today) return "expired";
  return row.status as DocumentStatus;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
function party(v: unknown) {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { name: typeof o.name === "string" ? o.name : "", reference: str(o.reference), address: str(o.address), phone: str(o.phone), email: str(o.email), website: str(o.website) };
}

/** A stored document → the engine's model (preview, PDF). */
export function rowToDocument(row: DocumentRow): DocumentData {
  const items: DocumentLine[] = Array.isArray(row.items)
    ? row.items.map((raw) => {
        const i = (raw ?? {}) as Record<string, unknown>;
        return {
          description: typeof i.description === "string" ? i.description : "",
          details: str(i.details),
          quantity: Number(i.quantity ?? 0),
          unitPrice: Number(i.unitPrice ?? 0),
          discountPercent: Number(i.discountPercent ?? 0),
          productId: str(i.productId),
          variantId: str(i.variantId),
          serviceId: str(i.serviceId),
        };
      })
    : [];
  return {
    type: row.doc_type as DocumentType,
    template: row.template as DocumentData["template"],
    language: row.language as DocumentData["language"],
    currency: row.currency as DocumentData["currency"],
    number: row.number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    business: party(row.business_snapshot),
    customer: party(row.customer_snapshot),
    items,
    discount: Number(row.discount),
    taxRate: Number(row.tax_rate),
    taxLabel: row.tax_label,
    notes: row.notes,
    terms: row.terms,
    payment: row.doc_type === "receipt" && row.payment_method ? { method: row.payment_method as ReceiptMethod, reference: row.payment_reference, amountPaid: Number(row.amount_paid ?? 0) } : null,
    invoicePaid: row.doc_type === "invoice" && row.status !== "draft" ? Number(row.amount_paid ?? 0) : null,
    related: related(row.related),
    stamp: row.status === "draft" ? "draft" : row.status === "voided" ? "voided" : row.status === "paid" ? "paid" : null,
  };
}

const amount = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
function related(v: unknown): DocumentRelated | null {
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!o || (o.kind !== "invoice" && o.kind !== "order") || typeof o.number !== "string") return null;
  return { kind: o.kind, number: o.number, total: amount(o.total), paidToDate: amount(o.paidToDate), balance: amount(o.balance) };
}

/** Customers to pick from in the editor. */
export async function listDocumentCustomers(businessId: string): Promise<CustomerChoice[]> {
  const db = await createClient();
  const { data } = await db.from("customers").select("id, reference, name, whatsapp_phone, email, city").eq("business_id", businessId).order("name").limit(2000);
  return (data ?? []).map((c) => ({ id: c.id, reference: c.reference, name: c.name || `+${c.whatsapp_phone}`, phone: c.whatsapp_phone ? `+${c.whatsapp_phone}` : null, email: c.email, address: c.city }));
}

/** Active products (each variant / colour × size combination on its own line) and services, at today's prices. */
export async function listDocumentCatalog(businessId: string): Promise<CatalogChoice[]> {
  const db = await createClient();
  const [{ data: products }, { data: services }] = await Promise.all([
    db.from("products").select("id, name, price, options, product_variants(id, name, value, options, price_modifier, sort_order)").eq("business_id", businessId).eq("active", true).order("name").limit(1000),
    db.from("services").select("id, name, price").eq("business_id", businessId).eq("active", true).order("sort_order").limit(500),
  ]);
  const out: CatalogChoice[] = [];
  for (const p of products ?? []) {
    const opts = parseOptions(p.options);
    const variants = [...p.product_variants].sort((a, b) => a.sort_order - b.sort_order);
    if (!variants.length) out.push({ key: `p:${p.id}`, label: p.name, unitPrice: Number(p.price), productId: p.id });
    for (const v of variants) {
      out.push({ key: `v:${v.id}`, label: `${p.name} — ${variantLabel(v, opts)}`, unitPrice: Math.max(0, Number(p.price) + Number(v.price_modifier)), productId: p.id, variantId: v.id });
    }
  }
  for (const s of services ?? []) out.push({ key: `s:${s.id}`, label: s.name, unitPrice: Number(s.price ?? 0), serviceId: s.id });
  return out;
}

/** Payments recorded against an invoice without an order (newest last), with who recorded them. */
export async function listInvoicePayments(businessId: string, documentId: string) {
  const db = await createClient();
  const { data } = await db
    .from("invoice_payments")
    .select("id, amount, method, reference, note, received_at, recorded_by, voided_at, void_reason")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .order("received_at");
  return data ?? [];
}

/** Live receipts by the payment they were made from (order or invoice payment id → receipt). */
export async function receiptsForPayments(businessId: string, source: "order" | "invoice", paymentIds: string[]) {
  const map = new Map<string, { id: string; number: string | null }>();
  if (!paymentIds.length) return map;
  const db = await createClient();
  const column = source === "order" ? "order_payment_id" : "invoice_payment_id";
  for (let i = 0; i < paymentIds.length; i += 150) {
    const { data } = await db
      .from("documents")
      .select("id, number, order_payment_id, invoice_payment_id")
      .eq("business_id", businessId)
      .eq("doc_type", "receipt")
      .neq("status", "voided")
      .in(column, paymentIds.slice(i, i + 150));
    for (const r of data ?? []) {
      const key = source === "order" ? r.order_payment_id : r.invoice_payment_id;
      if (key) map.set(key, { id: r.id, number: r.number });
    }
  }
  return map;
}

/** The order's live invoice, if it has one. */
export async function orderInvoice(businessId: string, orderId: string) {
  const db = await createClient();
  const { data } = await db
    .from("documents")
    .select("id, number, status")
    .eq("business_id", businessId)
    .eq("order_id", orderId)
    .eq("doc_type", "invoice")
    .neq("status", "voided")
    .maybeSingle();
  return data;
}

/** Can a document go to this customer on WhatsApp right now? (Shown before sending; the send checks again.) */
export async function whatsappSendState(businessId: string, customerId: string | null) {
  if (!customerId) return { customer: null, connected: false, windowOpen: false, templateApproved: false };
  const db = await createClient();
  const [{ data: customer }, { data: connection }, { data: conversation }, { count: approved }] = await Promise.all([
    db.from("customers").select("id, name, whatsapp_phone").eq("business_id", businessId).eq("id", customerId).maybeSingle(),
    db.from("whatsapp_connections").select("status").eq("business_id", businessId).maybeSingle(),
    db
      .from("conversations")
      .select("last_customer_message_at")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .neq("status", "archived")
      .order("last_customer_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    // Outside the 24-hour window, the approved "document" template carries the PDF.
    db.from("whatsapp_templates").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("kind", "document").eq("status", "approved"),
  ]);
  return {
    customer: customer ? { id: customer.id, name: customer.name || `+${customer.whatsapp_phone}`, phone: customer.whatsapp_phone } : null,
    connected: connection?.status === "connected",
    windowOpen: windowOpen(conversation?.last_customer_message_at),
    templateApproved: (approved ?? 0) > 0,
  };
}
