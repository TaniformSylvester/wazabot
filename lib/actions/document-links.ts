"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { businessSnapshot, getDocument, getDocumentSettings, rowToDocument } from "@/lib/data/documents";
import { customerStatement } from "@/lib/data/statements";
import { DOCUMENT_LABELS } from "@/lib/documents/labels";
import { pdfFileName, renderDocumentPdf, renderStatementPdf, statementFileName } from "@/lib/documents/pdf/render";
import { logoFromStorageUrl } from "@/lib/documents/server";
import { RECEIPT_METHODS } from "@/lib/documents/types";
import { sendPdfOnWhatsApp } from "@/lib/documents/whatsapp";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { paymentError, receivedAt } from "@/lib/payments/received";
import { createClient } from "@/lib/supabase/server";
import { money, optionalText } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * WazaBolt Docs (Phase 2) — documents linked to orders, payments and customers.
 * Lines, totals and amounts come from the database functions (never from the
 * browser); payments are recorded by staff, receipts only from recorded
 * payments; documents are sent on WhatsApp only when WhatsApp accepts them.
 */

const docPath = (locale: string, path: string) => (isLocale(locale) ? localizePath(locale, path) : path);

function linkError(error: { code?: string; message?: string } | null): FormState {
  const m = error?.message ?? "";
  if (m.includes("already has an invoice")) return fail("invoice_exists");
  if (m.includes("this invoice has payments")) return fail("invoice_has_payments");
  if (m.includes("cancelled or returned")) return fail("invalid", { amount: ["order_closed"] });
  return paymentError(error);
}

/** Staff: an issued invoice for an order (lines and totals from the order). Opens it. */
export async function createOrderInvoice(orderId: string, locale: string): Promise<FormState> {
  if (!isUuid(orderId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const settings = await getDocumentSettings(ctx.business.id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order_invoice", { p_order_id: orderId, p_business_snapshot: businessSnapshot(ctx.business, settings) });
  if (error || !data) {
    logServerError("documents.orderInvoice", error);
    return linkError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  redirect(docPath(locale, `/dashboard/documents/${data.id}?issued=1`));
}

const invoicePaymentSchema = z.object({
  amount: money.refine((v) => v > 0, "invalid_number"),
  method: z.enum(RECEIPT_METHODS, { error: "invalid_option" }),
  reference: optionalText(100),
  note: optionalText(500),
  received_on: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date").optional()),
  client_key: z.uuid(),
});

/** Staff: a payment received against an issued invoice (an order's invoice records it on the order). */
export async function recordInvoicePayment(documentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(documentId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const parsed = invoicePaymentSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const at = receivedAt(parsed.data.received_on, ctx.business.timezone);
  if (at === "future") return fail("invalid", { received_on: ["payment_date_future"] });
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_invoice_payment", {
    p_document_id: documentId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? undefined,
    p_client_key: parsed.data.client_key,
    p_received_at: at ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) {
    logServerError("documents.invoicePayment", error);
    return linkError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(documentId);
}

const voidSchema = z.object({
  payment_id: z.uuid({ error: "required" }),
  reason: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(3, "reason_required").max(300, "too_long")),
});

/** Owners/admins: void a payment recorded on an invoice by mistake (not while it has a receipt). */
export async function voidInvoicePayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = voidSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice_payment", { p_payment_id: parsed.data.payment_id, p_reason: parsed.data.reason });
  if (error) {
    logServerError("documents.voidInvoicePayment", error);
    return linkError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(parsed.data.payment_id);
}

/** Staff: the receipt for a recorded payment ('order' = order payment, 'invoice' = invoice payment). Opens it. */
export async function createPaymentReceipt(source: "order" | "invoice", paymentId: string, locale: string): Promise<FormState> {
  if (!isUuid(paymentId) || (source !== "order" && source !== "invoice")) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const settings = await getDocumentSettings(ctx.business.id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payment_receipt", {
    p_source: source,
    p_payment_id: paymentId,
    p_business_snapshot: businessSnapshot(ctx.business, settings),
  });
  if (error || !data) {
    logServerError("documents.paymentReceipt", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  redirect(docPath(locale, `/dashboard/documents/${data.id}?issued=1`));
}

/** Staff: an issued document's PDF to its customer on WhatsApp (inside the 24-hour window). */
export async function sendDocumentWhatsApp(documentId: string): Promise<FormState> {
  if (!isUuid(documentId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  // Read with the user's session: RLS proves the document is theirs.
  const row = await getDocument(ctx.business.id, documentId);
  if (!row || !row.customer_id) return fail("not_found");
  if (row.status === "draft" || row.status === "voided") return fail("document_locked");
  const doc = rowToDocument(row);
  let pdf: Buffer;
  try {
    pdf = await renderDocumentPdf(doc, { logo: await logoFromStorageUrl(ctx.business.logoUrl), branding: false });
  } catch (e) {
    logServerError("documents.whatsapp.pdf", e);
    return fail("unknown");
  }
  const L = DOCUMENT_LABELS[doc.language];
  const r = await sendPdfOnWhatsApp({
    businessId: ctx.business.id,
    userId: ctx.user.id,
    customerId: row.customer_id,
    pdf,
    fileName: pdfFileName(doc),
    caption: `${L.title[doc.type]} ${row.number} — ${ctx.business.name}`,
    label: { en: `${DOCUMENT_LABELS.en.title[doc.type].toLowerCase()} ${row.number}`, fr: `${DOCUMENT_LABELS.fr.title[doc.type].toLowerCase()} ${row.number}` },
    meta: { document_id: row.id, number: row.number },
  });
  if (!r.ok) return fail(r.error);
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(r.messageId);
}

const period = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  language: z.enum(["en", "fr"]).nullable(),
});

/** Staff: a customer's statement of account (the period shown on the page) on WhatsApp. */
export async function sendStatementWhatsApp(customerId: string, options: { from: string | null; to: string | null; language: "en" | "fr" | null }): Promise<FormState> {
  if (!isUuid(customerId)) return fail("invalid");
  const p = period.safeParse(options);
  if (!p.success) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const st = await customerStatement(ctx.business, customerId, p.data);
  if (!st) return fail("not_found");
  let pdf: Buffer;
  try {
    pdf = await renderStatementPdf(st, { logo: await logoFromStorageUrl(ctx.business.logoUrl), branding: false });
  } catch (e) {
    logServerError("statements.whatsapp.pdf", e);
    return fail("unknown");
  }
  const r = await sendPdfOnWhatsApp({
    businessId: ctx.business.id,
    userId: ctx.user.id,
    customerId,
    pdf,
    fileName: statementFileName(st),
    caption: `${DOCUMENT_LABELS[st.language].statement.title} — ${ctx.business.name}`,
    label: { en: DOCUMENT_LABELS.en.statement.title.toLowerCase(), fr: DOCUMENT_LABELS.fr.statement.title.toLowerCase() },
    meta: { statement: true, from: st.from, to: st.to },
  });
  if (!r.ok) return fail(r.error);
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(r.messageId);
}
