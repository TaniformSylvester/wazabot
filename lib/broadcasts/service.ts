import "server-only";

import { logServerError } from "@/lib/log";
import { customerConversation } from "@/lib/notifications/service";
import type { createAdminClient } from "@/lib/supabase/admin";
import { GraphApiError } from "@/lib/whatsapp/graph";
import { whatsappForBusiness, type BusinessWhatsApp } from "@/lib/whatsapp/connection";
import { recordWhatsAppSend } from "@/lib/whatsapp/usage";

import { OPT_REPLY, broadcastTemplateName, renderBroadcast, type BroadcastLanguage } from "./compose";

/*
 * Broadcasts (Stage 8), on the server with the service role.
 *
 *   submit  → the broadcast's MARKETING template goes to Meta for review
 *   start   → once approved: the audience is frozen (prepare_broadcast), then
 *   process → each recipient gets the template; opted-out customers are
 *             skipped even if they were in the audience. Runs until a deadline
 *             and can be resumed (button, or the daily job) without sending twice.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type WhatsAppFor = (businessId: string) => Promise<BusinessWhatsApp | null>;

const META_STATUS: Record<string, string> = { APPROVED: "approved", REJECTED: "rejected", PAUSED: "paused", DISABLED: "disabled", PENDING: "pending", IN_APPEAL: "pending" };
const FALLBACK_NAME: Record<BroadcastLanguage, string> = { en: "there", fr: "cher client" };
const graphError = (e: unknown) => (e instanceof GraphApiError ? { code: String(e.code ?? e.status), message: e.title } : e);

export async function submitBroadcastTemplate(admin: Admin, businessId: string, broadcastId: string, wa: WhatsAppFor = whatsappForBusiness) {
  const { data: b } = await admin.from("broadcasts").select("id, body, language, personalized, template_name").eq("id", broadcastId).eq("business_id", businessId).maybeSingle();
  if (!b) return { ok: false as const, error: "not_found" as const };
  const conn = await wa(businessId);
  if (!conn?.wabaId) return { ok: false as const, error: "whatsapp_not_connected" as const };
  try {
    const created = await conn.client.createTemplate(conn.wabaId, {
      name: b.template_name,
      language: b.language,
      body: b.body,
      example: b.personalized ? ["Brenda"] : [],
      category: "MARKETING",
    });
    await admin.from("broadcasts").update({ meta_template_id: created.id, template_status: META_STATUS[created.status] ?? "pending", template_reason: null }).eq("id", b.id);
    return { ok: true as const };
  } catch (e) {
    logServerError("broadcasts.template", graphError(e));
    await admin
      .from("broadcasts")
      .update({ template_status: "failed", template_reason: (e instanceof GraphApiError ? e.summary : "submit failed").slice(0, 300) })
      .eq("id", b.id);
    return { ok: false as const, error: "template_failed" as const };
  }
}

/** Meta's review status for the broadcast's template. */
export async function syncBroadcastTemplate(admin: Admin, businessId: string, broadcastId: string, wa: WhatsAppFor = whatsappForBusiness) {
  const { data: b } = await admin.from("broadcasts").select("id, template_name, language").eq("id", broadcastId).eq("business_id", businessId).maybeSingle();
  const conn = await wa(businessId);
  if (!b || !conn?.wabaId) return false;
  try {
    const t = (await conn.client.listTemplates(conn.wabaId)).find((x) => x.name === b.template_name && x.language === b.language);
    if (t) {
      await admin
        .from("broadcasts")
        .update({ meta_template_id: t.id, template_status: META_STATUS[t.status] ?? "pending", template_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason.slice(0, 300) : null })
        .eq("id", b.id);
    }
    return true;
  } catch (e) {
    logServerError("broadcasts.sync", graphError(e));
    return false;
  }
}

export async function startBroadcast(admin: Admin, businessId: string, broadcastId: string, wa: WhatsAppFor = whatsappForBusiness) {
  const { data: b } = await admin.from("broadcasts").select("id, status, template_status").eq("id", broadcastId).eq("business_id", businessId).maybeSingle();
  if (!b) return { ok: false as const, error: "not_found" as const };
  if (b.template_status !== "approved") return { ok: false as const, error: "template_not_approved" as const };
  if (b.status !== "draft") return { ok: false as const, error: "already_sent" as const };
  if (!(await wa(businessId))) return { ok: false as const, error: "whatsapp_not_connected" as const };
  const { data: count, error } = await admin.rpc("prepare_broadcast", { p_broadcast_id: broadcastId });
  if (error) {
    logServerError("broadcasts.prepare", error);
    return { ok: false as const, error: "already_sent" as const };
  }
  return { ok: true as const, recipients: count ?? 0 };
}

/** Sends to pending recipients until done or the deadline; safe to call again. */
export async function processBroadcast(admin: Admin, businessId: string, broadcastId: string, deadline = Date.now() + 240_000, wa: WhatsAppFor = whatsappForBusiness) {
  const { data: b } = await admin.from("broadcasts").select("id, status, language, template_name, personalized, body").eq("id", broadcastId).eq("business_id", businessId).maybeSingle();
  if (!b || b.status !== "sending") return;
  const conn = await wa(businessId);
  if (!conn) return;
  const language = b.language as BroadcastLanguage;

  while (Date.now() < deadline) {
    const { data: batch } = await admin
      .from("broadcast_recipients")
      .select("id, customer_id, customers(name, whatsapp_phone, marketing_opt_in)")
      .eq("broadcast_id", b.id)
      .eq("status", "pending")
      .limit(25);
    if (!batch?.length) break;
    for (const r of batch) {
      if (Date.now() >= deadline) break;
      const c = r.customers;
      // Opted out since the audience was frozen: never send.
      if (!c?.marketing_opt_in || !c.whatsapp_phone) {
        await admin.from("broadcast_recipients").update({ status: "skipped", error: "opted_out" }).eq("id", r.id).eq("status", "pending");
        continue;
      }
      const name = c.name || FALLBACK_NAME[language];
      let wamid: string | null = null;
      let error: string | null = null;
      try {
        wamid = (await conn.client.sendTemplate(conn.phoneNumberId, c.whatsapp_phone, b.template_name, language, b.personalized ? [name] : [])).messageId;
      } catch (e) {
        error = (e instanceof GraphApiError ? e.summary : "send failed").slice(0, 200);
        logServerError("broadcasts.send", graphError(e));
      }
      if (wamid) await recordWhatsAppSend(admin, businessId, conn.phoneNumberId, "marketing");
      const conversation = await customerConversation(admin, businessId, r.customer_id, new Date());
      let messageId: string | null = null;
      if (conversation) {
        const at = new Date().toISOString();
        const { data: msg } = await admin
          .from("messages")
          .insert({
            business_id: businessId,
            conversation_id: conversation.id,
            direction: "outbound",
            sender_type: "system",
            message_type: "text",
            content: renderBroadcast(b.body, name),
            language,
            whatsapp_message_id: wamid,
            wa_category: "marketing",
            delivery_status: wamid ? "sent" : "failed",
            delivery_error: error,
            status_updated_at: at,
            processing_status: "processed",
          })
          .select("id")
          .single();
        messageId = msg?.id ?? null;
      }
      await admin
        .from("broadcast_recipients")
        .update({ status: wamid ? "sent" : "failed", error, message_id: messageId, sent_at: wamid ? new Date().toISOString() : null })
        .eq("id", r.id)
        .eq("status", "pending");
    }
  }
  await refreshCounts(admin, b.id);
}

async function refreshCounts(admin: Admin, broadcastId: string) {
  const count = async (status: string) =>
    (await admin.from("broadcast_recipients").select("id", { count: "exact", head: true }).eq("broadcast_id", broadcastId).eq("status", status)).count ?? 0;
  const [pending, sent, failed] = await Promise.all([count("pending"), count("sent"), count("failed")]);
  await admin
    .from("broadcasts")
    .update({ sent_count: sent, failed_count: failed, ...(pending === 0 ? { status: "sent", finished_at: new Date().toISOString() } : {}) })
    .eq("id", broadcastId)
    .eq("status", "sending");
}

/** Broadcasts left half-sent (time limit, restart): carried on by the daily job. */
export async function resumeBroadcasts(admin: Admin, deadline = Date.now() + 240_000) {
  const { data } = await admin.from("broadcasts").select("id, business_id").eq("status", "sending").limit(20);
  for (const b of data ?? []) {
    if (Date.now() >= deadline) break;
    await processBroadcast(admin, b.business_id, b.id, deadline);
  }
}

/**
 * A customer texted STOP or START: update their consent and confirm (we're
 * inside the 24-hour window, they just wrote). The assistant doesn't reply to it.
 */
export async function applyOptKeyword(
  admin: Admin,
  job: { businessId: string; customerId: string; conversationId: string; messageId: string },
  keyword: "stop" | "start",
  wa: WhatsAppFor = whatsappForBusiness,
) {
  await admin.from("customers").update({ marketing_opt_in: keyword === "start" }).eq("id", job.customerId).eq("business_id", job.businessId);
  await admin.from("messages").update({ processing_status: "processed" }).eq("id", job.messageId).eq("business_id", job.businessId);
  const [conn, { data: customer }, { data: business }] = await Promise.all([
    wa(job.businessId),
    admin.from("customers").select("whatsapp_phone, preferred_language").eq("id", job.customerId).maybeSingle(),
    admin.from("businesses").select("name, default_language").eq("id", job.businessId).maybeSingle(),
  ]);
  if (!conn || !customer?.whatsapp_phone) return;
  const language: BroadcastLanguage = (customer.preferred_language ?? business?.default_language) === "fr" ? "fr" : "en";
  const text = OPT_REPLY[keyword][language].replace("{business}", business?.name ?? "");
  let wamid: string | null = null;
  try {
    wamid = (await conn.client.sendText(conn.phoneNumberId, customer.whatsapp_phone, text)).messageId;
  } catch (e) {
    logServerError("broadcasts.optReply", graphError(e));
  }
  const at = new Date().toISOString();
  await admin.from("messages").insert({
    business_id: job.businessId,
    conversation_id: job.conversationId,
    direction: "outbound",
    sender_type: "system",
    message_type: "text",
    content: text,
    language,
    whatsapp_message_id: wamid,
    wa_category: "service",
    delivery_status: wamid ? "sent" : "failed",
    status_updated_at: at,
    processing_status: "processed",
  });
  if (wamid) await recordWhatsAppSend(admin, job.businessId, conn.phoneNumberId, "service");
}

export { broadcastTemplateName };
