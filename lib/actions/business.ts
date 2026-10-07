"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { WEEKDAYS, dayHoursSchema, type OpeningHours } from "@/lib/business/hours";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { businessProfileSchema, receiptSettingsSchema } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, ok, type FormState } from "./form";

const ONBOARDING_STEPS = 6;

function nextStep(formData: FormData, current: number) {
  const step = Number(formData.get("onboarding_step"));
  return Number.isInteger(step) && step >= 1 && step <= ONBOARDING_STEPS ? Math.max(step, current) : current;
}

function onboardingRedirect(formData: FormData) {
  const locale = formData.get("locale");
  const goTo = formData.get("next_step");
  if (!isLocale(locale) || typeof goTo !== "string") return;
  redirect(localizePath(locale, goTo === "done" ? "/dashboard?onboarded=1" : `/dashboard/onboarding?step=${Number(goTo) || 1}`));
}

/** Onboarding step 1 and Settings → Business profile. */
export async function saveBusinessProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = businessProfileSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ ...parsed.data, onboarding_step: nextStep(formData, ctx.business.onboardingStep) })
    .eq("id", ctx.business.id);
  if (error) {
    logServerError("business.saveProfile", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  onboardingRedirect(formData);
  return ok(ctx.business.id);
}

/** Onboarding step 2 and Settings → Opening hours. Fields: hours.<day>.open|close|closed */
export async function saveOpeningHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");

  const hours: OpeningHours = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const day of WEEKDAYS) {
    const parsed = dayHoursSchema.safeParse({
      closed: formData.get(`hours.${day}.closed`) === "on",
      open: formData.get(`hours.${day}.open`) || "08:00",
      close: formData.get(`hours.${day}.close`) || "18:00",
    });
    if (parsed.success) hours[day] = parsed.data;
    else fieldErrors[`hours.${day}`] = ["invalid_time"];
  }
  if (Object.keys(fieldErrors).length) return fail("invalid", fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ opening_hours: hours, onboarding_step: nextStep(formData, ctx.business.onboardingStep) })
    .eq("id", ctx.business.id);
  if (error) {
    logServerError("business.saveOpeningHours", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  onboardingRedirect(formData);
  return ok(ctx.business.id);
}

/** Records onboarding progress for steps that have their own forms elsewhere (products, FAQs, WhatsApp). */
export async function advanceOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const finishing = formData.get("next_step") === "done";
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      onboarding_step: finishing ? ONBOARDING_STEPS : nextStep(formData, ctx.business.onboardingStep),
      ...(finishing ? { onboarding_completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", ctx.business.id);
  if (error) {
    logServerError("business.advanceOnboarding", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  onboardingRedirect(formData);
  return ok(ctx.business.id);
}

const LOGO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Settings → Receipts: the footer printed on receipts and the business logo.
 * The logo goes to the public product-images bucket under <business_id>/logo/,
 * which Storage policies only let owners/admins of that business write.
 */
export async function saveReceiptSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = receiptSettingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const update: { receipt_footer: string | null; logo_url?: string | null } = { receipt_footer: parsed.data.receipt_footer };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_TYPES[logo.type];
    if (!ext || logo.size > MAX_LOGO_BYTES) return fail("image_invalid");
    const path = `${ctx.business.id}/logo/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, logo, { contentType: logo.type, upsert: false });
    if (error) {
      logServerError("business.logo.upload", error);
      return fail("storage_unavailable");
    }
    update.logo_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  } else if (parsed.data.remove_logo) {
    update.logo_url = null;
  }

  const { error } = await supabase.from("businesses").update(update).eq("id", ctx.business.id);
  if (error) {
    logServerError("business.saveReceipt", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(ctx.business.id);
}
