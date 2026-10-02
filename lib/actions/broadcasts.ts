"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { MAX_BROADCAST_TEXT, broadcastTemplateName, composeBroadcastBody } from "@/lib/broadcasts/compose";
import { processBroadcast, startBroadcast, submitBroadcastTemplate, syncBroadcastTemplate } from "@/lib/broadcasts/service";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkbox, requiredText } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * Broadcasts (Stage 8): owners/admins write a promotion, WazaBolt submits it
 * to Meta as a marketing template, then sends it to opted-in customers.
 * Writes go through the service role after the role check (users can't
 * write broadcasts directly).
 */

const broadcastSchema = z.object({
  name: requiredText(120),
  language: z.enum(["en", "fr"], { error: "invalid_option" }),
  text: requiredText(MAX_BROADCAST_TEXT),
  personalized: checkbox,
  audience_tags: z.preprocess(
    (v) => (typeof v === "string" ? [...new Set(v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))] : v),
    z.array(z.string().max(30, "too_long")).max(20, "too_long"),
  ),
  audience_language: z.preprocess((v) => (v === "" ? null : v), z.enum(["en", "fr", "wes"]).nullable()),
});

const revalidate = () => revalidatePath("/[lang]/dashboard/broadcasts", "layout");

export async function createBroadcast(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = broadcastSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const admin = createAdminClient();
  if (!admin) return fail("whatsapp_not_configured");
  const b = parsed.data;
  const id = randomUUID();
  const { error } = await admin.from("broadcasts").insert({
    id,
    business_id: ctx.business.id,
    name: b.name,
    language: b.language,
    body: composeBroadcastBody(b.text, b.language, b.personalized),
    personalized: b.personalized,
    template_name: broadcastTemplateName(id),
    audience_tags: b.audience_tags,
    audience_language: b.audience_language,
    created_by: ctx.user.id,
  });
  if (error) {
    logServerError("broadcasts.create", error);
    return fail(dbError(error));
  }
  // Straight to Meta's review; if WhatsApp isn't connected it stays a draft (submit again later).
  await submitBroadcastTemplate(admin, ctx.business.id, id);
  revalidate();
  const locale = formData.get("locale");
  if (isLocale(locale)) redirect(localizePath(locale, `/dashboard/broadcasts/${id}`));
  return ok(id);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authorize>>>;
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function adminFor(id: string): Promise<{ error: FormState } | { ctx: Ctx; admin: Admin }> {
  if (!isUuid(id)) return { error: fail("invalid") };
  const ctx = await authorize("admin");
  if (!ctx) return { error: fail("forbidden") };
  const admin = createAdminClient();
  if (!admin) return { error: fail("whatsapp_not_configured") };
  return { ctx, admin };
}

export async function resubmitBroadcastTemplate(broadcastId: string): Promise<FormState> {
  const r = await adminFor(broadcastId);
  if ("error" in r) return r.error;
  const res = await submitBroadcastTemplate(r.admin, r.ctx.business.id, broadcastId);
  revalidate();
  return res.ok ? ok(broadcastId) : fail(res.error === "whatsapp_not_connected" ? "whatsapp_not_connected" : res.error === "not_found" ? "not_found" : "templates_failed");
}

export async function refreshBroadcastTemplate(broadcastId: string): Promise<FormState> {
  const r = await adminFor(broadcastId);
  if ("error" in r) return r.error;
  const done = await syncBroadcastTemplate(r.admin, r.ctx.business.id, broadcastId);
  revalidate();
  return done ? ok(broadcastId) : fail("whatsapp_not_connected");
}

export async function sendBroadcast(broadcastId: string): Promise<FormState> {
  const r = await adminFor(broadcastId);
  if ("error" in r) return r.error;
  const res = await startBroadcast(r.admin, r.ctx.business.id, broadcastId);
  if (!res.ok) return fail(res.error === "template_not_approved" ? "template_not_approved" : res.error === "whatsapp_not_connected" ? "whatsapp_not_connected" : res.error === "not_found" ? "not_found" : "broadcast_already_sent");
  console.info(`[broadcasts.send] business=${r.ctx.business.id} broadcast=${broadcastId} recipients=${res.recipients}`);
  const { admin, ctx } = r;
  after(() => processBroadcast(admin, ctx.business.id, broadcastId).catch((e) => logServerError("broadcasts.process", e)));
  revalidate();
  return ok(broadcastId);
}

export async function resumeBroadcast(broadcastId: string): Promise<FormState> {
  const r = await adminFor(broadcastId);
  if ("error" in r) return r.error;
  const { admin, ctx } = r;
  after(() => processBroadcast(admin, ctx.business.id, broadcastId).catch((e) => logServerError("broadcasts.process", e)));
  revalidate();
  return ok(broadcastId);
}

export async function deleteBroadcast(broadcastId: string, locale: string): Promise<FormState> {
  if (!isUuid(broadcastId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.from("broadcasts").delete().eq("id", broadcastId).eq("business_id", ctx.business.id).select("id");
  if (error) {
    logServerError("broadcasts.delete", error);
    return fail(dbError(error));
  }
  if (!data?.length) return fail("not_found");
  revalidate();
  if (isLocale(locale)) redirect(localizePath(locale, "/dashboard/broadcasts"));
  return ok();
}
