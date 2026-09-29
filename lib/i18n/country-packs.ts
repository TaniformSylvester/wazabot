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
  },
};

export const DEFAULT_COUNTRY = "CM";

export function getCountryPack(countryCode: string | null | undefined): CountryPack {
  return countryPacks[(countryCode ?? "").toUpperCase()] ?? countryPacks[DEFAULT_COUNTRY];
}
