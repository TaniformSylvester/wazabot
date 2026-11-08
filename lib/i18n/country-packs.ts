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
  NG: {
    countryCode: "NG",
    englishName: "Nigeria",
    currency: "NGN",
    timezone: "Africa/Lagos",
    defaultLanguage: "en",
    languages: ["en"],
    status: "active",
    dialCode: "234",
    // 080X XXX XXXX (070, 080, 081, 090, 091), or without the 0.
    localMobile: /^0?[789][01]\d{8}$/,
    phoneExample: "0803 123 4567",
  },
  ZA: {
    countryCode: "ZA",
    englishName: "South Africa",
    currency: "ZAR",
    timezone: "Africa/Johannesburg",
    defaultLanguage: "en",
    languages: ["en"],
    status: "active",
    dialCode: "27",
    // 06X, 07X or 08X XXX XXXX, or without the 0.
    localMobile: /^0?[6-8]\d{8}$/,
    phoneExample: "082 123 4567",
  },
  GH: {
    countryCode: "GH",
    englishName: "Ghana",
    currency: "GHS",
    timezone: "Africa/Accra",
    defaultLanguage: "en",
    languages: ["en"],
    status: "active",
    dialCode: "233",
    // 02X or 05X XXX XXXX, or without the 0.
    localMobile: /^0?[25]\d{8}$/,
    phoneExample: "024 123 4567",
  },
  KE: {
    countryCode: "KE",
    englishName: "Kenya",
    currency: "KES",
    timezone: "Africa/Nairobi",
    defaultLanguage: "en",
    languages: ["en"],
    status: "active",
    dialCode: "254",
    // 07XX or 01XX XXX XXX, or without the 0.
    localMobile: /^0?[17]\d{8}$/,
    phoneExample: "0712 345 678",
  },
};

/** The countries a business can choose, in this order (sign-up and Settings). */
export const ACTIVE_COUNTRIES = ["CM", "ZW", "NG", "ZA", "GH", "KE"] as const;
export type CountryCode = (typeof ACTIVE_COUNTRIES)[number];
export const isCountryCode = (v: unknown): v is CountryCode => (ACTIVE_COUNTRIES as readonly unknown[]).includes(v);

export const DEFAULT_COUNTRY = "CM";

export function getCountryPack(countryCode: string | null | undefined): CountryPack {
  return countryPacks[(countryCode ?? "").toUpperCase()] ?? countryPacks[DEFAULT_COUNTRY];
}
