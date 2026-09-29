"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageBusiness, getCurrentBusiness, requireUser } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { languageSettingsSchema, type SettingsActionResult } from "@/lib/validation/settings";

/** Save reply languages + response style in one transaction (update_business_language_settings). */
export async function saveLanguageSettings(input: unknown): Promise<SettingsActionResult> {
  await requireUser();
  const business = await getCurrentBusiness();
  if (!business || !canManageBusiness(business.role)) return { ok: false, error: "forbidden" };

  const parsed = languageSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  // Keep the default language first so it is also first in display order.
  const ordered = [v.defaultLanguage, ...v.enabledLanguages.filter((l) => l !== v.defaultLanguage)];

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_language_settings", {
    p_business_id: business.id,
    p_default_language: v.defaultLanguage,
    p_languages: ordered,
    p_language_mode: v.mode,
    p_tone: v.tone,
    p_formality: v.formality,
    p_emoji_level: v.emojiLevel,
    p_reply_length: v.replyLength,
    p_mirror_code_switching: v.mirrorCodeSwitching,
    p_style_notes: v.styleNotes,
  });
  if (error) {
    logServerError("settings.saveLanguageSettings", error);
    if (error.code === "42501") return { ok: false, error: "forbidden" };
    if (error.code === "22023" || error.code === "23514") return { ok: false, error: "invalid" };
    return { ok: false, error: "unknown" };
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return { ok: true };
}

/** Save the dashboard language on the profile and in auth metadata (used by the email templates). */
export async function setUiLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  await requireUser();
  const supabase = await createClient();
  const [{ error }, { error: metaError }] = await Promise.all([
    supabase.rpc("set_ui_locale", { p_locale: locale }),
    supabase.auth.updateUser({ data: { locale } }),
  ]);
  if (error || metaError) {
    logServerError("settings.setUiLocale", error ?? metaError);
    return { ok: false };
  }
  return { ok: true };
}
