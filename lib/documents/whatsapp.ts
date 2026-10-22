import "server-only";

import type { ActionErrorKey } from "@/lib/actions/form";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { GraphApiError } from "@/lib/whatsapp/graph";
import { whatsappForBusiness } from "@/lib/whatsapp/connection";
import { windowOpen } from "@/lib/whatsapp/service";
import { recordWhatsAppSend } from "@/lib/whatsapp/usage";

/*
 * Sends a PDF made by the document engine to a customer on WhatsApp: the file
 * is uploaded to WhatsApp (media upload), then sent as a document message.
 * Only inside the 24-hour customer-service window: outside it WhatsApp only
 * accepts approved templates, and none with a document is set up yet, so
 * nothing is sent and the caller says why. Nothing is reported as sent unless
 * WhatsApp accepted it. The message appears in the customer's conversation.
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
  /** Kept with the message and in the audit log, e.g. { document_id, number } or { statement: true }. */
  meta: Record<string, string | boolean | null>;
};

export type SendPdfResult = { ok: true; messageId: string } | { ok: false; error: ActionErrorKey };

export async function sendPdfOnWhatsApp(input: SendPdfInput, wa = whatsappForBusiness): Promise<SendPdfResult> {
  const admin = createAdminClient();
  const conn = await wa(input.businessId);
  if (!conn || !admin) return { ok: false, error: "whatsapp_not_connected" };

  const [{ data: customer }, { data: conversation }] = await Promise.all([
    admin.from("customers").select("whatsapp_phone").eq("business_id", input.businessId).eq("id", input.customerId).maybeSingle(),
    admin
      .from("conversations")
      .select("id, last_customer_message_at")
      .eq("business_id", input.businessId)
      .eq("customer_id", input.customerId)
      .neq("status", "archived")
      .order("last_customer_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!customer?.whatsapp_phone) return { ok: false, error: "not_found" };
  if (!conversation || !windowOpen(conversation.last_customer_message_at)) return { ok: false, error: "whatsapp_window_closed" };

  const now = new Date().toISOString();
  const { data: msg, error: insertError } = await admin
    .from("messages")
    .insert({
      business_id: input.businessId,
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "agent",
      message_type: "document",
      content: input.fileName,
      caption: input.caption,
      payload: { document_file: input.fileName, ...input.meta },
      delivery_status: "pending",
      wa_category: "service",
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
    const { messageId } = await conn.client.sendDocument(conn.phoneNumberId, customer.whatsapp_phone, media.id, input.fileName, input.caption);
    await admin.from("messages").update({ whatsapp_message_id: messageId, delivery_status: "sent", status_updated_at: now }).eq("id", msg.id);
    await recordWhatsAppSend(admin, input.businessId, conn.phoneNumberId, "service");
  } catch (e) {
    const g = e instanceof GraphApiError ? e : null;
    logServerError("documents.whatsapp.send", g ? { code: String(g.code ?? g.status), message: g.title } : e);
    await admin.from("messages").update({ delivery_status: "failed", delivery_error: g?.summary ?? "send failed", status_updated_at: now }).eq("id", msg.id);
    return { ok: false, error: g?.isWindowClosed ? "whatsapp_window_closed" : "whatsapp_send_failed" };
  }

  await Promise.all([
    admin.from("conversations").update({ last_message_at: now }).eq("business_id", input.businessId).eq("id", conversation.id),
    admin.from("audit_logs").insert({
      business_id: input.businessId,
      actor_user_id: input.userId,
      action: "document.sent_whatsapp",
      entity_type: input.meta.document_id ? "document" : "customer",
      entity_id: String(input.meta.document_id ?? input.customerId),
      metadata: { file: input.fileName, message_id: msg.id, ...input.meta },
    }),
  ]);
  return { ok: true, messageId: msg.id };
}
