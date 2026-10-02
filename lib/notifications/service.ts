import "server-only";

import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";
import { GraphApiError } from "@/lib/whatsapp/graph";
import { whatsappForBusiness, type BusinessWhatsApp } from "@/lib/whatsapp/connection";
import { windowOpen } from "@/lib/whatsapp/service";

import {
  NOTIFICATION_KINDS,
  TEMPLATE_LANGUAGES,
  TEMPLATES,
  bodyParams,
  renderBody,
  templateLanguageFor,
  templateName,
  type NotificationKind,
  type TemplateLanguage,
} from "./templates";

/*
 * Customer notifications on WhatsApp (Stage 7). Runs on the server with the
 * service role (it needs the business's WhatsApp token).
 *
 *   inside the 24-hour window  → a normal text message
 *   outside it                 → the approved template, in the customer's language
 *   no approved template       → skipped (recorded with the reason)
 *
 * Every attempt is a `notifications` row; its event key is unique, so an
 * order status or an appointment event is never announced twice.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type WhatsAppFor = (businessId: string) => Promise<BusinessWhatsApp | null>;

const META_STATUS: Record<string, string> = { APPROVED: "approved", REJECTED: "rejected", PAUSED: "paused", DISABLED: "disabled", PENDING: "pending", IN_APPEAL: "pending" };
const kindFromName = (name: string) => NOTIFICATION_KINDS.find((k) => templateName(k) === name) ?? null;

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export type TemplateSubmitResult = { submitted: number; failed: number; error?: "whatsapp_not_connected" | "no_account" };

/** Submits WazaBolt's standard templates (each kind, English and French) that aren't already pending or approved. */
export async function submitTemplates(admin: Admin, businessId: string, wa: WhatsAppFor = whatsappForBusiness): Promise<TemplateSubmitResult> {
  const conn = await wa(businessId);
  if (!conn) return { submitted: 0, failed: 0, error: "whatsapp_not_connected" };
  if (!conn.wabaId) return { submitted: 0, failed: 0, error: "no_account" };
  const { data: existing } = await admin.from("whatsapp_templates").select("kind, language, status").eq("business_id", businessId);
  const keep = new Set((existing ?? []).filter((t) => t.status === "pending" || t.status === "approved").map((t) => `${t.kind}:${t.language}`));

  let submitted = 0;
  let failed = 0;
  for (const kind of NOTIFICATION_KINDS) {
    for (const language of TEMPLATE_LANGUAGES) {
      if (keep.has(`${kind}:${language}`)) continue;
      const def = TEMPLATES[kind];
      const row = { business_id: businessId, kind, language, name: templateName(kind), body: def.body[language], submitted_at: new Date().toISOString() };
      try {
        const created = await conn.client.createTemplate(conn.wabaId, { name: row.name, language, body: row.body, example: [...def.example] });
        const { error } = await admin
          .from("whatsapp_templates")
          .upsert({ ...row, meta_template_id: created.id, status: META_STATUS[created.status] ?? "pending", rejected_reason: null }, { onConflict: "business_id,kind,language" });
        if (error) logServerError("notifications.templateSave", error);
        submitted++;
      } catch (e) {
        failed++;
        const reason = e instanceof GraphApiError ? e.summary : "submit failed";
        logServerError("notifications.template", e instanceof GraphApiError ? { code: String(e.code ?? e.status), message: e.title } : e);
        await admin.from("whatsapp_templates").upsert({ ...row, status: "failed", rejected_reason: reason.slice(0, 300) }, { onConflict: "business_id,kind,language" });
      }
    }
  }
  // Templates that already existed on Meta (e.g. submitted before) get their real status.
  await syncTemplates(admin, businessId, wa);
  return { submitted, failed };
}

/** Pulls Meta's review status for the business's WazaBolt templates. */
export async function syncTemplates(admin: Admin, businessId: string, wa: WhatsAppFor = whatsappForBusiness): Promise<boolean> {
  const conn = await wa(businessId);
  if (!conn?.wabaId) return false;
  try {
    const remote = await conn.client.listTemplates(conn.wabaId);
    for (const t of remote) {
      const kind = kindFromName(t.name);
      const language = (TEMPLATE_LANGUAGES as readonly string[]).includes(t.language) ? (t.language as TemplateLanguage) : null;
      if (!kind || !language) continue;
      const { error } = await admin.from("whatsapp_templates").upsert(
        {
          business_id: businessId,
          kind,
          language,
          name: t.name,
          body: TEMPLATES[kind].body[language],
          meta_template_id: t.id,
          status: META_STATUS[t.status] ?? "pending",
          rejected_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason.slice(0, 300) : null,
        },
        { onConflict: "business_id,kind,language" },
      );
      if (error) logServerError("notifications.templateSave", error);
    }
    return true;
  } catch (e) {
    logServerError("notifications.sync", e instanceof GraphApiError ? { code: String(e.code ?? e.status), message: e.title } : e);
    return false;
  }
}

/** Meta's webhook "message_template_status_update" (APPROVED, REJECTED …), matched by template id. */
export async function recordTemplateStatus(admin: Admin, update: { templateId: string; event: string; reason?: string | null }) {
  const status = META_STATUS[update.event.toUpperCase()];
  if (!status) return;
  await admin
    .from("whatsapp_templates")
    .update({ status, rejected_reason: status === "rejected" && update.reason && update.reason !== "NONE" ? update.reason.slice(0, 300) : null })
    .eq("meta_template_id", update.templateId);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
export type NotifyEvent = {
  businessId: string;
  kind: NotificationKind;
  customerId: string;
  orderId?: string | null;
  appointmentId?: string | null;
  /** Unique per business: the same event is never sent twice. */
  eventKey: string;
  /** Template parameters by name (see TEMPLATES[kind].params). */
  values: Record<string, string>;
};

export type NotifyResult = { status: "sent" | "failed" | "skipped" | "duplicate"; channel?: "text" | "template"; reason?: string };

export async function notify(admin: Admin, ev: NotifyEvent, wa: WhatsAppFor = whatsappForBusiness, now = new Date()): Promise<NotifyResult> {
  // Claim the event first: a second attempt (double click, retried request) stops here.
  const { data: claimed, error: claimError } = await admin
    .from("notifications")
    .upsert(
      { business_id: ev.businessId, kind: ev.kind, customer_id: ev.customerId, order_id: ev.orderId ?? null, appointment_id: ev.appointmentId ?? null, event_key: ev.eventKey, status: "skipped", reason: "in_progress" },
      { onConflict: "business_id,event_key", ignoreDuplicates: true },
    )
    .select("id");
  if (claimError) {
    logServerError("notifications.claim", claimError);
    return { status: "failed", reason: "db" };
  }
  let notificationId = claimed?.[0]?.id as string | undefined;
  if (!notificationId) {
    // Already recorded: only a skipped or failed attempt may be tried again (e.g. once the template is approved).
    const { data: retry } = await admin
      .from("notifications")
      .update({ status: "skipped", reason: "in_progress" })
      .eq("business_id", ev.businessId)
      .eq("event_key", ev.eventKey)
      .in("status", ["skipped", "failed"])
      .neq("reason", "in_progress")
      .select("id");
    notificationId = retry?.[0]?.id;
    if (!notificationId) return { status: "duplicate" };
  }
  const finish = async (r: NotifyResult, messageId?: string | null) => {
    await admin.from("notifications").update({ status: r.status, channel: r.channel ?? null, reason: r.reason ?? null, message_id: messageId ?? null }).eq("id", notificationId);
    return r;
  };

  const [conn, { data: customer }, { data: business }] = await Promise.all([
    wa(ev.businessId),
    admin.from("customers").select("whatsapp_phone, preferred_language").eq("id", ev.customerId).eq("business_id", ev.businessId).maybeSingle(),
    admin.from("businesses").select("default_language").eq("id", ev.businessId).maybeSingle(),
  ]);
  if (!conn) return finish({ status: "skipped", reason: "whatsapp_not_connected" });
  if (!customer?.whatsapp_phone) return finish({ status: "skipped", reason: "no_phone" });

  const conversation = await customerConversation(admin, ev.businessId, ev.customerId, now);
  if (!conversation) return finish({ status: "failed", reason: "no_conversation" });
  const language = templateLanguageFor(customer.preferred_language, business?.default_language ?? "en");
  const open = windowOpen(conversation.lastCustomerMessageAt, now.getTime());

  let channel: "text" | "template" = "text";
  let usedLanguage: TemplateLanguage = language;
  let wamid: string | null = null;
  let error: string | null = null;
  try {
    if (open) {
      wamid = (await conn.client.sendText(conn.phoneNumberId, customer.whatsapp_phone, renderBody(ev.kind, language, ev.values))).messageId;
    } else {
      channel = "template";
      const { data: templates } = await admin.from("whatsapp_templates").select("language").eq("business_id", ev.businessId).eq("kind", ev.kind).eq("status", "approved");
      const approved = (templates ?? []).map((t) => t.language as TemplateLanguage);
      const pick = approved.includes(language) ? language : approved[0];
      if (!pick) return finish({ status: "skipped", channel, reason: "template_not_approved" });
      usedLanguage = pick;
      wamid = (await conn.client.sendTemplate(conn.phoneNumberId, customer.whatsapp_phone, templateName(ev.kind), pick, bodyParams(ev.kind, ev.values))).messageId;
    }
  } catch (e) {
    error = e instanceof GraphApiError ? e.summary : "send failed";
    logServerError("notifications.send", e instanceof GraphApiError ? { code: String(e.code ?? e.status), message: e.title } : e);
  }

  // The notification appears in the conversation like any other message.
  const at = now.toISOString();
  const { data: msg } = await admin
    .from("messages")
    .insert({
      business_id: ev.businessId,
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "system",
      message_type: "text",
      content: renderBody(ev.kind, usedLanguage, ev.values),
      language: usedLanguage,
      whatsapp_message_id: wamid,
      delivery_status: wamid ? "sent" : "failed",
      delivery_error: error,
      status_updated_at: at,
      processing_status: "processed",
    })
    .select("id")
    .single();
  await admin.from("conversations").update({ last_message_at: at }).eq("id", conversation.id).eq("business_id", ev.businessId);
  return finish(wamid ? { status: "sent", channel } : { status: "failed", channel, reason: "send_failed" }, msg?.id);
}

/** The customer's latest conversation, or a new (resolved) one so the notification has somewhere to live. */
async function customerConversation(admin: Admin, businessId: string, customerId: string, now: Date) {
  const { data } = await admin
    .from("conversations")
    .select("id, last_customer_message_at")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .neq("status", "archived")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (data) return { id: data.id, lastCustomerMessageAt: data.last_customer_message_at };
  const { data: created, error } = await admin
    .from("conversations")
    .insert({ business_id: businessId, customer_id: customerId, status: "resolved", last_message_at: now.toISOString() })
    .select("id")
    .single();
  if (error || !created) {
    logServerError("notifications.conversation", error);
    return null;
  }
  return { id: created.id, lastCustomerMessageAt: null };
}
