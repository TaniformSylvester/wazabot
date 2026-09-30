"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { WEEKDAYS, dayHoursSchema, type OpeningHours } from "@/lib/business/hours";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { businessProfileSchema } from "@/lib/validation/app";

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
