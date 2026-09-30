"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorize, getBusinessAiSettings } from "@/lib/auth/dal";
import { REPLY_LENGTHS, TONES } from "@/lib/ai/style";
import { isLocale } from "@/lib/i18n/config";
import { LANGUAGE_CODES, aiLanguageCodes } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { aiSettingsSchema } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, ok, type FormState } from "./form";

/** AI Assistant → General settings (owners/admins). Languages are saved by saveLanguageSettings. */
export async function saveAiSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = aiSettingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.after_hours_mode === "after_hours_message" && !parsed.data.after_hours_message) {
    return fail("invalid", { after_hours_message: ["required"] });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_settings").update(parsed.data).eq("business_id", ctx.business.id).select("business_id");
  if (error) {
    logServerError("ai.saveSettings", error);
    return fail(dbError(error));
  }
  if (!data?.length) return fail("not_found");
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(ctx.business.id);
}

const personalitySchema = z.object({
  tone: z.enum(TONES, { error: "invalid_option" }),
  reply_length: z.enum(REPLY_LENGTHS, { error: "invalid_option" }),
  language: z.enum(["auto", ...LANGUAGE_CODES], { error: "invalid_option" }),
});

/**
 * Onboarding step 5: personality, response length and language
 * ("auto" = detect English, French and Pidgin; otherwise always one language).
 * Saved through update_business_language_settings so languages stay consistent.
 */
export async function saveOnboardingPersonality(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = personalitySchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const current = await getBusinessAiSettings();
  if (!current) return fail("not_found");
  const { tone, reply_length, language } = parsed.data;

  const auto = language === "auto";
  const defaultLanguage = auto ? current.language.defaultLanguage : language;
  const enabled = auto ? [...aiLanguageCodes] : [...new Set([language, ...current.language.enabledLanguages])];
  const ordered = [defaultLanguage, ...enabled.filter((l) => l !== defaultLanguage)];

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_language_settings", {
    p_business_id: ctx.business.id,
    p_default_language: defaultLanguage,
    p_languages: ordered,
    p_language_mode: auto ? "auto" : "fixed",
    p_tone: tone,
    p_formality: current.style.formality,
    p_emoji_level: current.style.emojiLevel,
    p_reply_length: reply_length,
    p_mirror_code_switching: current.style.mirrorCodeSwitching,
    p_style_notes: current.style.styleNotes,
  });
  if (error) {
    logServerError("ai.saveOnboardingPersonality", error);
    return fail(dbError(error));
  }
  const step = Math.max(5, ctx.business.onboardingStep);
  await supabase.from("businesses").update({ onboarding_step: step }).eq("id", ctx.business.id);
  revalidatePath("/[lang]/dashboard", "layout");
  const locale = formData.get("locale");
  if (isLocale(locale)) redirect(localizePath(locale, "/dashboard/onboarding?step=6"));
  return ok(ctx.business.id);
}
