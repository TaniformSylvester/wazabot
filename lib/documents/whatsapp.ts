import "server-only";

import type { ActionErrorKey } from "@/lib/actions/form";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { GraphApiError } from "@/lib/whatsapp/graph";
import { whatsappForBusiness } from "@/lib/whatsapp/connection";
import { customerConversation } from "@/lib/notifications/service";
import { bodyParams, renderBody, templateLanguageFor, templateName, type TemplateLanguage } from "@/lib/notifications/templates";
import { windowOpen } from "@/lib/whatsapp/service";
import { recordWhatsAppSend } from "@/lib/whatsapp/usage";

/*
 * Sends a PDF made by the document engine to a customer on WhatsApp: the file
 * is uploaded to WhatsApp (media upload), then sent.
 *
 *   inside the 24-hour window  → a document message with its caption
 *   outside it                 → the approved "document" template (the PDF in
 *                                its header), in the customer's language
 *   no approved template       → nothing is sent, and the caller says why
 *
 * Nothing is reported as sent unless WhatsApp accepted it. The message
 * appears in the customer's conversation.
 *
 * The caller has already checked the user's role and that the document or
 * customer belongs to their business (with the user's own session).
 */

export type SendPdfInput = {
  businessId: string;
  userId: string;
  customerId: string;
  pdf: Buffer;
  fileName: string;
  caption: string;
  /** What the document is, for the template message ("invoice INV-2026-000041"), in each template language. */
  label: Record<TemplateLanguage, string>;
  /** Kept with the message and in the audit log, e.g. { document_id, number } or { statement: true }. */
  meta: Record<string, string | boolean | null>;
};

export type SendPdfResult = { ok: true; messageId: string; channel: "document" | "template" } | { ok: false; error: ActionErrorKey };

export async function sendPdfOnWhatsApp(input: SendPdfInput, wa = whatsappForBusiness, now = new Date()): Promise<SendPdfResult> {
  const admin = createAdminClient();
  const conn = await wa(input.businessId);
  if (!conn || !admin) return { ok: false, error: "whatsapp_not_connected" };

  const [{ data: customer }, { data: business }] = await Promise.all([
    admin.from("customers").select("whatsapp_phone, name, preferred_language").eq("business_id", input.businessId).eq("id", input.customerId).maybeSingle(),
    admin.from("businesses").select("name, default_language").eq("id", input.businessId).maybeSingle(),
  ]);
  if (!customer?.whatsapp_phone) return { ok: false, error: "not_found" };
  // The conversation the customer last wrote in (as shown before sending), or a new one to keep the message in.
  const { data: latest } = await admin
    .from("conversations")
    .select("id, last_customer_message_at")
    .eq("business_id", input.businessId)
    .eq("customer_id", input.customerId)
    .neq("status", "archived")
    .order("last_customer_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const conversation = latest ? { id: latest.id, lastCustomerMessageAt: latest.last_customer_message_at } : await customerConversation(admin, input.businessId, input.customerId, now);
  if (!conversation) return { ok: false, error: "unknown" };
  const open = windowOpen(conversation.lastCustomerMessageAt, now.getTime());

  // Outside the window: only the approved document template, in the customer's language when there is one.
  let template: TemplateLanguage | null = null;
  if (!open) {
    const { data: approved } = await admin.from("whatsapp_templates").select("language").eq("business_id", input.businessId).eq("kind", "document").eq("status", "approved");
    const languages = (approved ?? []).map((t) => t.language as TemplateLanguage);
    const wanted = templateLanguageFor(customer.preferred_language, business?.default_language ?? "en");
    template = languages.includes(wanted) ? wanted : (languages[0] ?? null);
    if (!template) return { ok: false, error: "whatsapp_window_closed" };
  }
  const values = { customer: customer.name?.trim() || (template === "fr" ? "cher client" : "there"), document: template ? input.label[template] : "", business: business?.name ?? "" };
  const at = now.toISOString();
  const { data: msg, error: insertError } = await admin
    .from("messages")
    .insert({
      business_id: input.businessId,
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "agent",
      message_type: "document",
      content: input.fileName,
      caption: template ? renderBody("document", template, values) : input.caption,
      payload: { document_file: input.fileName, ...input.meta, ...(template ? { template: templateName("document"), template_language: template } : {}) },
      delivery_status: "pending",
      wa_category: template ? "utility" : "service",
      sent_by: input.userId,
      processing_status: "processed",
    })
    .select("id")
    .single();
  if (insertError || !msg) {
    logServerError("documents.whatsapp.record", insertError);
    return { ok: false, error: "unknown" };
  }

  try {
    const media = await conn.client.uploadMedia(conn.phoneNumberId, input.pdf, "application/pdf", input.fileName);
    const { messageId } = template
      ? await conn.client.sendTemplate(conn.phoneNumberId, customer.whatsapp_phone, templateName("document"), template, bodyParams("document", values), { mediaId: media.id, fileName: input.fileName })
      : await conn.client.sendDocument(conn.phoneNumberId, customer.whatsapp_phone, media.id, input.fileName, input.caption);
    await admin.from("messages").update({ whatsapp_message_id: messageId, delivery_status: "sent", status_updated_at: at }).eq("id", msg.id);
    await recordWhatsAppSend(admin, input.businessId, conn.phoneNumberId, template ? "utility" : "service");
  } catch (e) {
    const g = e instanceof GraphApiError ? e : null;
    logServerError("documents.whatsapp.send", g ? { code: String(g.code ?? g.status), message: g.title } : e);
    await admin.from("messages").update({ delivery_status: "failed", delivery_error: g?.summary ?? "send failed", status_updated_at: at }).eq("id", msg.id);
    return { ok: false, error: g?.isWindowClosed ? "whatsapp_window_closed" : "whatsapp_send_failed" };
  }

  await Promise.all([
    admin.from("conversations").update({ last_message_at: at }).eq("business_id", input.businessId).eq("id", conversation.id),
    admin.from("audit_logs").insert({
      business_id: input.businessId,
      actor_user_id: input.userId,
      action: "document.sent_whatsapp",
      entity_type: input.meta.document_id ? "document" : "customer",
      entity_id: String(input.meta.document_id ?? input.customerId),
      metadata: { file: input.fileName, message_id: msg.id, channel: template ? "template" : "document", ...input.meta },
    }),
  ]);
  return { ok: true, messageId: msg.id, channel: template ? "template" : "document" };
}
