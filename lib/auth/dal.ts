import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { INDUSTRIES, ROLE_RANK, oneOf, type BusinessRole, type Industry } from "@/types/database";
import {
  EMOJI_LEVELS,
  FORMALITY_LEVELS,
  LANGUAGE_MODES,
  REPLY_LENGTHS,
  TONES,
  defaultResponseStyle,
  type LanguageSettings,
  type ResponseStyle,
} from "@/lib/ai/style";
import { parseOpeningHours, type OpeningHours } from "@/lib/business/hours";
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
  slug: string;
  role: BusinessRole;
  status: string;
  description: string | null;
  industry: Industry | null;
  countryCode: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  openingHours: OpeningHours;
  defaultLanguage: LanguageCode;
  /** Reply languages, in display order. */
  languages: LanguageCode[];
  onboardingStep: number;
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
    .select(
      "role, businesses(id, name, slug, status, description, industry, country_code, city, address, phone, email, website, logo_url, currency, timezone, opening_hours, default_language, onboarding_step, onboarding_completed_at)",
    )
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
    slug: b.slug,
    role: data.role,
    status: b.status,
    description: b.description,
    industry: b.industry ? oneOf(INDUSTRIES, b.industry, "other") : null,
    countryCode: b.country_code,
    city: b.city,
    address: b.address,
    phone: b.phone,
    email: b.email,
    website: b.website,
    logoUrl: b.logo_url,
    currency: b.currency,
    timezone: b.timezone,
    openingHours: parseOpeningHours(b.opening_hours),
    defaultLanguage,
    languages: languages.length ? languages : [defaultLanguage],
    onboardingStep: b.onboarding_step,
    onboardingCompletedAt: b.onboarding_completed_at,
  };
});

export type BusinessContext = { user: CurrentUser; business: CurrentBusiness };

/**
 * For dashboard pages: the signed-in user and their business, or a redirect
 * to login. Every query after this still goes through Row Level Security.
 */
export async function requireBusiness(next = "/dashboard"): Promise<BusinessContext> {
  const user = await requireUser(next);
  const business = await getCurrentBusiness();
  if (!business) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { user, business };
}

/** Role check for Server Actions (the database enforces the same rule). */
export function hasRole(role: BusinessRole, min: BusinessRole) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * For Server Actions: the business context when the user has at least `min`,
 * otherwise null (the action returns "forbidden").
 */
export async function authorize(min: BusinessRole): Promise<BusinessContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const business = await getCurrentBusiness();
  if (!business || !hasRole(business.role, min)) return null;
  return { user, business };
}

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
      mode: oneOf(LANGUAGE_MODES, data?.language_mode, "auto"),
      defaultLanguage: business.defaultLanguage,
      enabledLanguages: business.languages,
    },
    style: data
      ? {
          tone: oneOf(TONES, data.tone, "friendly"),
          formality: oneOf(FORMALITY_LEVELS, data.formality, "neutral"),
          emojiLevel: oneOf(EMOJI_LEVELS, data.emoji_level, "light"),
          replyLength: oneOf(REPLY_LENGTHS, data.reply_length, "short"),
          mirrorCodeSwitching: data.mirror_code_switching,
          styleNotes: data.style_notes,
        }
      : defaultResponseStyle,
  };
});

export function canManageBusiness(role: BusinessRole) {
  return hasRole(role, "admin");
}
