/**
 * UI locales — the languages the website, auth pages and dashboard are
 * available in. (The WhatsApp AI supports more languages; see languages.ts.)
 * To add a UI locale: add a dictionary in messages/, register it in
 * lib/i18n/dictionaries.ts, add it here and set `ui_supported` in the
 * `languages` table.
 */
export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Remembers the visitor's choice; set by proxy.ts on full page loads and by the language switcher. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Intl locale for number/date formatting (Cameroon conventions). */
export const intlLocale: Record<Locale, string> = { en: "en-CM", fr: "fr-CM" };

/** Open Graph locale codes. */
export const ogLocale: Record<Locale, string> = { en: "en_US", fr: "fr_FR" };
