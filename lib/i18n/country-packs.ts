import type { LanguageCode } from "./languages";

/**
 * A country pack bundles the defaults a business gets when it signs up in
 * that country: currency, timezone and the languages its customers use.
 * Mirrored by the `country_packs` / `country_pack_languages` tables.
 */
export type CountryPack = {
  countryCode: string; // ISO 3166-1 alpha-2
  englishName: string;
  currency: string; // ISO 4217
  timezone: string; // IANA
  defaultLanguage: LanguageCode;
  /** In display order. All are enabled for new businesses. */
  languages: LanguageCode[];
  status: "active" | "planned";
  /** International dialling code, digits only. */
  dialCode: string;
  /** A local mobile number as people type it (digits only), e.g. 6XXXXXXXX in Cameroon; a leading trunk "0" is dropped. */
  localMobile: RegExp;
  /** An example local number, for hints. */
  phoneExample: string;
};

export const countryPacks: Record<string, CountryPack> = {
  CM: {
    countryCode: "CM",
    englishName: "Cameroon",
    currency: "XAF",
    timezone: "Africa/Douala",
    defaultLanguage: "en",
    languages: ["en", "fr", "wes"],
    status: "active",
    dialCode: "237",
    localMobile: /^[62]\d{8}$/,
    phoneExample: "6 70 00 00 00",
  },
  ZW: {
    countryCode: "ZW",
    englishName: "Zimbabwe",
    currency: "USD",
    timezone: "Africa/Harare",
    defaultLanguage: "en",
    languages: ["en"],
    status: "active",
    dialCode: "263",
    // 07X XXX XXXX, or without the 0.
    localMobile: /^0?7\d{8}$/,
    phoneExample: "077 123 4567",
  },
};

/** The countries a business can choose, in this order (sign-up and Settings). */
export const ACTIVE_COUNTRIES = ["CM", "ZW"] as const;
export type CountryCode = (typeof ACTIVE_COUNTRIES)[number];
export const isCountryCode = (v: unknown): v is CountryCode => (ACTIVE_COUNTRIES as readonly unknown[]).includes(v);

export const DEFAULT_COUNTRY = "CM";

export function getCountryPack(countryCode: string | null | undefined): CountryPack {
  return countryPacks[(countryCode ?? "").toUpperCase()] ?? countryPacks[DEFAULT_COUNTRY];
}
