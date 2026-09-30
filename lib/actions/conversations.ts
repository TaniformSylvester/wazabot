"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { conversationStatusSchema } from "@/lib/validation/app";

import { dbError, fail, isUuid, ok, type FormState } from "./form";

/**
 * Opens a conversation record for a customer (or returns the open one).
 * Messages arrive through WhatsApp in Stage 2; nothing is sent from here.
 */
export async function startConversation(customerId: string, locale: string): Promise<FormState> {
  if (!isUuid(customerId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", ctx.business.id)
    .eq("customer_id", customerId)
    .in("status", ["open", "pending"])
    .limit(1)
    .maybeSingle();

  let id = existing?.id;
  if (!id) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ business_id: ctx.business.id, customer_id: customerId })
      .select("id")
      .single();
    if (error || !data) {
      logServerError("conversations.start", error);
      return fail(dbError(error));
    }
    id = data.id;
  }
  revalidatePath("/[lang]/dashboard", "layout");
  if (isLocale(locale)) redirect(localizePath(locale, `/dashboard/conversations/${id}`));
  return ok(id);
}

/**
 * Human takeover. ai_enabled=false → "Human Mode": the AI will not answer this
 * conversation (enforced by the Stage 2 message pipeline); true → "AI Online".
 */
export async function setConversationAi(conversationId: string, aiEnabled: boolean): Promise<FormState> {
  if (!isUuid(conversationId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update(aiEnabled ? { ai_enabled: true, human_requested: false } : { ai_enabled: false, assigned_to: ctx.user.id })
    .eq("id", conversationId)
    .eq("business_id", ctx.business.id)
    .select("id");
  if (error) {
    logServerError("conversations.setAi", error);
    return fail(dbError(error));
  }
  if (!data?.length) return fail("not_found");
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(conversationId);
}

export async function setConversationStatus(conversationId: string, status: string): Promise<FormState> {
  const parsed = conversationStatusSchema.safeParse(status);
  if (!isUuid(conversationId) || !parsed.success) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: parsed.data })
    .eq("id", conversationId)
    .eq("business_id", ctx.business.id);
  if (error) return fail(dbError(error));
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(conversationId);
}

/** Clears the unread counter when a team member opens the conversation. */
export async function markConversationRead(conversationId: string): Promise<void> {
  if (!isUuid(conversationId)) return;
  const ctx = await authorize("agent");
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId).eq("business_id", ctx.business.id).gt("unread_count", 0);
}
