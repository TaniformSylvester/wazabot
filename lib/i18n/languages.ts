/**
 * The platform language registry — the single source of truth for which
 * languages WazaBolt knows about, shared by the website/dashboard UI and the
 * WhatsApp AI. The `languages` table in the database mirrors this list
 * (supabase/migrations/20260929120000_multilingual_foundation.sql).
 *
 * Adding a language (e.g. a new African country pack):
 *   1. add it here and to the `languages` table (new migration),
 *   2. add an AI language pack in lib/ai/language/packs/,
 *   3. optionally a UI dictionary in messages/ if the dashboard should use it,
 *   4. list it in the country's pack (lib/i18n/country-packs.ts + table).
 *
 * Codes are BCP-47. Cameroonian Pidgin English uses its ISO 639-3 code `wes`
 * (Nigerian Pidgin is a different language, `pcm`).
 */

export const LANGUAGE_CODES = ["en", "fr", "wes"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export type LanguageDefinition = {
  code: LanguageCode;
  englishName: string;
  nativeName: string;
  /** French display name, for the French dashboard. */
  frenchName: string;
  direction: "ltr" | "rtl";
  /** Can the website/dashboard be displayed in it? */
  ui: boolean;
  /** Can the WhatsApp AI understand and reply in it? */
  ai: boolean;
  /**
   * Language to reply in when this one is not enabled for a business —
   * normally the language it is closest to (Pidgin → English).
   */
  fallback: LanguageCode | null;
};

export const languages: Record<LanguageCode, LanguageDefinition> = {
  en: {
    code: "en",
    englishName: "English",
    nativeName: "English",
    frenchName: "Anglais",
    direction: "ltr",
    ui: true,
    ai: true,
    fallback: null,
  },
  fr: {
    code: "fr",
    englishName: "French",
    nativeName: "Français",
    frenchName: "Français",
    direction: "ltr",
    ui: true,
    ai: true,
    fallback: null,
  },
  wes: {
    code: "wes",
    englishName: "Cameroonian Pidgin English",
    nativeName: "Pidgin (Kamtok)",
    frenchName: "Pidgin camerounais",
    direction: "ltr",
    ui: false,
    ai: true,
    fallback: "en",
  },
};

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export const aiLanguageCodes = LANGUAGE_CODES.filter((c) => languages[c].ai);

/** Display name of a language in the given UI locale. */
export function languageName(code: LanguageCode, uiLocale: "en" | "fr") {
  return uiLocale === "fr" ? languages[code].frenchName : languages[code].englishName;
}
