import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import type { BusinessRole } from "@/types/database";
import { defaultResponseStyle, type LanguageSettings, type ResponseStyle } from "@/lib/ai/style";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  uiLocale: Locale;
};

export type CurrentBusiness = {
  id: string;
  name: string;
  role: BusinessRole;
  countryCode: string;
  currency: string;
  timezone: string;
  defaultLanguage: LanguageCode;
  /** Reply languages, in display order. */
  languages: LanguageCode[];
  onboardingCompletedAt: string | null;
};

/** The signed-in user, verified with the Auth server. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Always per-request: auth state must never be baked in at build time.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase.from("users").select("full_name, ui_locale").eq("id", data.user.id).maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile?.full_name || (data.user.user_metadata?.full_name as string | undefined) || "",
    uiLocale: isLocale(profile?.ui_locale) ? profile.ui_locale : DEFAULT_LOCALE,
  };
});

/**
 * Use in any protected page, layout, Server Action or Route Handler.
 * `next` should be a locale-prefixed path; proxy.ts localizes /login.
 */
export async function requireUser(next = "/dashboard") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * The business the user belongs to. Row Level Security guarantees only the
 * user's own memberships are returned. Assumes one business per user for now.
 */
export const getCurrentBusiness = cache(async (): Promise<CurrentBusiness | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_members")
    .select("role, businesses(id, name, country_code, currency, timezone, default_language, onboarding_completed_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const b = data?.businesses;
  if (!data || !b) return null;

  const { data: langs } = await supabase
    .from("business_languages")
    .select("language_code")
    .eq("business_id", b.id)
    .order("sort_order", { ascending: true });

  const defaultLanguage = isLanguageCode(b.default_language) ? b.default_language : "en";
  const languages = (langs ?? []).map((l) => l.language_code).filter(isLanguageCode);

  return {
    id: b.id,
    name: b.name,
    role: data.role,
    countryCode: b.country_code,
    currency: b.currency,
    timezone: b.timezone,
    defaultLanguage,
    languages: languages.length ? languages : [defaultLanguage],
    onboardingCompletedAt: b.onboarding_completed_at,
  };
});

export type BusinessAiSettings = { language: LanguageSettings; style: ResponseStyle; saved: boolean };

/** Language mode and response style for the current business (defaults if the row is missing). */
export const getBusinessAiSettings = cache(async (): Promise<BusinessAiSettings | null> => {
  const business = await getCurrentBusiness();
  if (!business) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ai_settings").select("*").eq("business_id", business.id).maybeSingle();

  return {
    saved: !!data,
    language: {
      mode: data?.language_mode ?? "auto",
      defaultLanguage: business.defaultLanguage,
      enabledLanguages: business.languages,
    },
    style: data
      ? {
          tone: data.tone,
          formality: data.formality,
          emojiLevel: data.emoji_level,
          replyLength: data.reply_length,
          mirrorCodeSwitching: data.mirror_code_switching,
          styleNotes: data.style_notes,
        }
      : defaultResponseStyle,
  };
});

export function canManageBusiness(role: BusinessRole) {
  return role === "owner" || role === "admin";
}
