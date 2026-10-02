"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/dal";
import { logServerError } from "@/lib/log";
import { notifyFollowUp } from "@/lib/notifications/events";
import { submitTemplates, syncTemplates } from "@/lib/notifications/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkbox } from "@/lib/validation/app";
import { z } from "zod";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * Customer notifications (Stage 7): settings (owners/admins), WazaBolt's
 * message templates on Meta (submit / refresh, owners/admins) and the
 * follow-up template after the 24-hour window (agents and up).
 */

const settingsSchema = z.object({ order_updates: checkbox, appointment_updates: checkbox, appointment_reminders: checkbox });
const revalidate = () => revalidatePath("/[lang]/dashboard", "layout");

export async function saveNotificationSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = settingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_settings").update(parsed.data).eq("business_id", ctx.business.id).select("business_id");
  if (error) {
    logServerError("notifications.settings", error);
    return fail(dbError(error));
  }
  if (!data?.length) return fail("not_found");
  revalidate();
  return ok();
}

export async function submitTemplatesAction(): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const admin = createAdminClient();
  if (!admin) return fail("whatsapp_not_configured");
  const r = await submitTemplates(admin, ctx.business.id);
  if (r.error) return fail("whatsapp_not_connected");
  revalidate();
  return r.failed && !r.submitted ? fail("templates_failed") : ok();
}

export async function syncTemplatesAction(): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const admin = createAdminClient();
  if (!admin) return fail("whatsapp_not_configured");
  if (!(await syncTemplates(admin, ctx.business.id))) return fail("whatsapp_not_connected");
  revalidate();
  return ok();
}

/** Conversation page, after the 24-hour window: sends the follow-up template so the customer can reply. */
export async function sendFollowUp(conversationId: string): Promise<FormState> {
  if (!isUuid(conversationId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const admin = createAdminClient();
  if (!admin) return fail("whatsapp_not_configured");
  const r = await notifyFollowUp(admin, ctx.business.id, conversationId);
  revalidate();
  if (!r) return fail("not_found");
  if (r.status === "sent") return ok(conversationId);
  if (r.status === "duplicate") return fail("follow_up_already_sent");
  if (r.reason === "template_not_approved") return fail("template_not_approved");
  if (r.reason === "whatsapp_not_connected") return fail("whatsapp_not_connected");
  return fail("whatsapp_send_failed");
}
