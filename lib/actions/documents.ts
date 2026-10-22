"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { getDocument, getDocumentSettings } from "@/lib/data/documents";
import { computeTotals } from "@/lib/documents/calc";
import type { SubmitResult } from "@/lib/documents/editor-state";
import { BUSINESS_MAX_ITEMS, documentSchema } from "@/lib/documents/schema";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * WazaBolt Docs — saving, issuing, voiding and duplicating business documents.
 * The business details come from the business profile (never from the browser),
 * totals are recomputed here by the document engine, and the database checks
 * roles again (RLS + issue_document / void_document).
 */

const docPath = (locale: string, path: string) => (isLocale(locale) ? localizePath(locale, path) : path);

/** Create or update a draft; with intent "issue", also give it its number. Redirects to the document on success. */
export async function saveDocument(locale: string, id: string | null, input: unknown, customerId: string | null, intent: "save" | "issue"): Promise<SubmitResult> {
  const ctx = await authorize("agent");
  if (!ctx) return { ok: false, error: "forbidden" };
  if (id !== null && !isUuid(id)) return { ok: false, error: "invalid" };
  const parsed = documentSchema(BUSINESS_MAX_ITEMS).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", issues: parsed.error.issues.slice(0, 30).map((i) => ({ path: i.path.join("."), message: i.message })) };
  const d = parsed.data;
  const b = ctx.business;
  if (d.type === "receipt" && !["owner", "admin"].includes(b.role) && intent === "issue") return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  let customer: string | null = null;
  if (customerId) {
    if (!isUuid(customerId)) return { ok: false, error: "invalid" };
    const { data } = await supabase.from("customers").select("id").eq("business_id", b.id).eq("id", customerId).maybeSingle();
    customer = data?.id ?? null;
  }

  const settings = await getDocumentSettings(b.id);
  const business = {
    name: b.name,
    reference: settings.business_reference,
    address: [b.address, b.city].filter(Boolean).join(", ") || null,
    phone: b.phone,
    email: b.email,
    website: b.website,
  };
  const totals = computeTotals({ ...d, currency: b.currency as typeof d.currency });
  const row = {
    template: d.template,
    language: d.language,
    currency: b.currency,
    issue_date: d.issueDate,
    due_date: d.type === "receipt" ? null : (d.dueDate ?? null),
    customer_id: customer,
    business_snapshot: business,
    customer_snapshot: d.customer,
    items: d.items.map((i) => ({ description: i.description, details: i.details, quantity: i.quantity, unitPrice: i.unitPrice, discountPercent: i.discountPercent, productId: i.productId ?? null, variantId: i.variantId ?? null, serviceId: i.serviceId ?? null })),
    discount: totals.discount,
    tax_rate: d.taxRate,
    tax_label: d.taxLabel,
    subtotal: totals.subtotal,
    tax_amount: totals.tax,
    total: totals.total,
    amount_paid: d.type === "receipt" ? totals.paid : null,
    payment_method: d.type === "receipt" ? (d.payment?.method ?? null) : null,
    payment_reference: d.type === "receipt" ? (d.payment?.reference ?? null) : null,
    notes: d.notes,
    terms: d.terms,
  };

  let docId = id;
  if (id) {
    const { data, error } = await supabase.from("documents").update(row).eq("id", id).eq("business_id", b.id).eq("status", "draft").select("id");
    if (error) {
      logServerError("documents.update", error);
      return { ok: false, error: dbError(error) };
    }
    if (!data?.length) return { ok: false, error: "document_locked" };
  } else {
    const { data, error } = await supabase.from("documents").insert({ ...row, business_id: b.id, doc_type: d.type, created_by: ctx.user.id }).select("id").single();
    if (error || !data) {
      logServerError("documents.insert", error);
      return { ok: false, error: dbError(error) };
    }
    docId = data.id;
  }

  if (intent === "issue") {
    const { error } = await supabase.rpc("issue_document", { p_document_id: docId! });
    if (error) {
      logServerError("documents.issue", error);
      revalidatePath("/[lang]/dashboard/documents", "layout");
      return { ok: false, error: dbError(error) };
    }
  }
  revalidatePath("/[lang]/dashboard/documents", "layout");
  redirect(docPath(locale, `/dashboard/documents/${docId}?${intent === "issue" ? "issued" : "saved"}=1`));
}

async function rpcAction(name: "issue_document" | "void_document" | "set_quotation_status", args: Record<string, string>, min: "agent" | "admin"): Promise<FormState> {
  const ctx = await authorize(min);
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args as never);
  if (error) {
    logServerError(`documents.${name}`, error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/documents", "layout");
  return ok(args.p_document_id);
}

export async function issueDocument(id: string): Promise<FormState> {
  if (!isUuid(id)) return fail("invalid");
  return rpcAction("issue_document", { p_document_id: id }, "agent");
}

export async function setQuotationStatus(id: string, status: "sent" | "accepted" | "rejected"): Promise<FormState> {
  if (!isUuid(id) || !["sent", "accepted", "rejected"].includes(status)) return fail("invalid");
  return rpcAction("set_quotation_status", { p_document_id: id, p_status: status }, "agent");
}

const voidSchema = z.object({ reason: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(3, "reason_required").max(300, "too_long")) });
export async function voidDocument(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(id)) return fail("invalid");
  const parsed = voidSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  return rpcAction("void_document", { p_document_id: id, p_reason: parsed.data.reason }, "admin");
}

/** Deletes a draft (issued documents are kept: void them). */
export async function deleteDraft(id: string, locale: string): Promise<FormState> {
  if (!isUuid(id)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", id).eq("business_id", ctx.business.id).eq("status", "draft").select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("document_locked");
  revalidatePath("/[lang]/dashboard/documents", "layout");
  redirect(docPath(locale, "/dashboard/documents?deleted=1"));
}

/** A new draft with the same customer, lines and terms — the way to correct an issued document. */
export async function duplicateDocument(id: string, locale: string): Promise<FormState> {
  if (!isUuid(id)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const src = await getDocument(ctx.business.id, id);
  if (!src) return fail("not_found");
  const settings = await getDocumentSettings(ctx.business.id);
  const today = new Date().toISOString().slice(0, 10);
  const days = src.doc_type === "quotation" ? 30 : settings.default_due_days;
  const due = src.doc_type === "receipt" ? null : new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      business_id: ctx.business.id,
      doc_type: src.doc_type,
      template: src.template,
      language: src.language,
      currency: src.currency,
      issue_date: today,
      due_date: due,
      customer_id: src.customer_id,
      business_snapshot: src.business_snapshot,
      customer_snapshot: src.customer_snapshot,
      items: src.items,
      discount: src.discount,
      tax_rate: src.tax_rate,
      tax_label: src.tax_label,
      subtotal: src.subtotal,
      tax_amount: src.tax_amount,
      total: src.total,
      amount_paid: src.amount_paid,
      payment_method: src.payment_method,
      payment_reference: null,
      notes: src.notes,
      terms: src.terms,
      duplicated_from: src.id,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    logServerError("documents.duplicate", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/documents", "layout");
  redirect(docPath(locale, `/dashboard/documents/${data.id}/edit?duplicated=1`));
}

const prefix = z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.string().regex(/^[A-Z0-9]{1,8}$/, "invalid_prefix"));
const settingsSchema = z.object({
  invoice_prefix: prefix,
  receipt_prefix: prefix,
  quotation_prefix: prefix,
  include_year: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  number_padding: z.coerce.number({ error: "invalid_integer" }).int("invalid_integer").min(3, "invalid_integer").max(8, "invalid_integer"),
  default_template: z.enum(["classic", "modern", "minimal"], { error: "invalid_option" }),
  default_language: z.preprocess((v) => (v === "" ? null : v), z.enum(["en", "fr"], { error: "invalid_option" }).nullable()),
  default_due_days: z.coerce.number({ error: "invalid_integer" }).int("invalid_integer").min(0, "invalid_integer").max(365, "invalid_integer"),
  default_tax_rate: z.preprocess((v) => (v === "" ? 0 : typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number({ error: "invalid_number" }).min(0, "invalid_number").max(100, "invalid_number")),
  default_tax_label: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(30, "too_long").nullable()),
  default_notes: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(2000, "too_long").nullable()),
  default_terms: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(2000, "too_long").nullable()),
  business_reference: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(60, "too_long").nullable()),
});

/** Documents → Settings (owners and admins): numbering and defaults. */
export async function saveDocumentSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = settingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("document_settings").upsert({ business_id: ctx.business.id, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) {
    logServerError("documents.settings", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/documents", "layout");
  return ok();
}
