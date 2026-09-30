"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { connectWhatsApp, disconnectWhatsApp, whatsappForBusiness } from "@/lib/whatsapp/connection";
import { GraphApiError } from "@/lib/whatsapp/graph";
import { windowOpen } from "@/lib/whatsapp/service";

import { fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

const connectSchema = z.object({
  phone_number_id: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().regex(/^[0-9]{5,32}$/, "invalid_number")),
  waba_id: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().regex(/^[0-9]{5,32}$/, "invalid_number")),
  access_token: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(20, "required").max(2048, "too_long")),
});

/** Dashboard → WhatsApp: verify the number with Meta and store the token encrypted (owners/admins). */
export async function connectWhatsAppAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = connectSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const res = await connectWhatsApp(ctx.business.id, ctx.user.id, {
    phoneNumberId: parsed.data.phone_number_id,
    wabaId: parsed.data.waba_id,
    accessToken: parsed.data.access_token,
  });
  revalidatePath("/[lang]/dashboard", "layout");
  if (!res.ok) return fail(`whatsapp_${res.error}`);
  return ok(ctx.business.id);
}

export async function disconnectWhatsAppAction(): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const done = await disconnectWhatsApp(ctx.business.id, ctx.user.id);
  revalidatePath("/[lang]/dashboard", "layout");
  return done ? ok() : fail("unknown");
}

const sendSchema = z.object({
  conversation_id: z.uuid(),
  text: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1, "required").max(4096, "too_long")),
});

/**
 * A team member replies from the dashboard. The reply is recorded first
 * (pending), then sent through the business's number; the conversation
 * switches to Human Mode so the assistant won't answer over the person.
 */
export async function sendWhatsAppMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const parsed = sendSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { conversation_id, text } = parsed.data;
  const businessId = ctx.business.id;

  // Read with the user's session: RLS proves the conversation is theirs.
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, last_customer_message_at, customers(whatsapp_phone)")
    .eq("business_id", businessId)
    .eq("id", conversation_id)
    .maybeSingle();
  if (!conv?.customers) return fail("not_found");
  if (!windowOpen(conv.last_customer_message_at)) return fail("whatsapp_window_closed");

  const wa = await whatsappForBusiness(businessId);
  const admin = createAdminClient();
  if (!wa || !admin) return fail("whatsapp_not_connected");

  const now = new Date().toISOString();
  const { data: msg, error: insertError } = await admin
    .from("messages")
    .insert({
      business_id: businessId,
      conversation_id,
      direction: "outbound",
      sender_type: "agent",
      message_type: "text",
      content: text,
      delivery_status: "pending",
      sent_by: ctx.user.id,
      processing_status: "processed",
    })
    .select("id")
    .single();
  if (insertError || !msg) {
    logServerError("whatsapp.send.record", insertError);
    return fail("unknown");
  }

  try {
    const { messageId } = await wa.client.sendText(wa.phoneNumberId, conv.customers.whatsapp_phone, text);
    await admin.from("messages").update({ whatsapp_message_id: messageId, delivery_status: "sent", status_updated_at: now }).eq("id", msg.id);
  } catch (e) {
    const g = e instanceof GraphApiError ? e : null;
    logServerError("whatsapp.send", g ? { code: String(g.code ?? g.status), message: g.title } : e);
    await admin.from("messages").update({ delivery_status: "failed", delivery_error: g?.summary ?? "send failed", status_updated_at: now }).eq("id", msg.id);
    revalidatePath("/[lang]/dashboard", "layout");
    return fail(g?.isWindowClosed ? "whatsapp_window_closed" : "whatsapp_send_failed");
  }

  // Human Mode + mark handled by this person.
  await supabase
    .from("conversations")
    .update({ ai_enabled: false, assigned_to: ctx.user.id, unread_count: 0 })
    .eq("business_id", businessId)
    .eq("id", conversation_id);
  await admin.from("conversations").update({ last_message_at: now }).eq("business_id", businessId).eq("id", conversation_id);
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(msg.id);
}

/** Blue ticks: tells WhatsApp the team has read the customer's latest message (best effort). */
export async function markWhatsAppRead(conversationId: string): Promise<void> {
  if (!isUuid(conversationId)) return;
  const ctx = await authorize("agent");
  if (!ctx) return;
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("messages")
    .select("whatsapp_message_id")
    .eq("business_id", ctx.business.id)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .not("whatsapp_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last?.whatsapp_message_id) return;
  const wamid = last.whatsapp_message_id;
  const businessId = ctx.business.id;
  after(async () => {
    const wa = await whatsappForBusiness(businessId);
    await wa?.client.markRead(wa.phoneNumberId, wamid).catch((e) => logServerError("whatsapp.markRead", e instanceof GraphApiError ? { code: String(e.code), message: e.title } : e));
  });
}
