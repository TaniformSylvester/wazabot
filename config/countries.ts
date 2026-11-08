import { getCountryPack, type CountryCode } from "@/lib/i18n/country-packs";

/**
 * The public page for each country WazaBolt sells in outside Cameroon
 * (/countries/<slug>): Cameroon is the home page itself. The facts come from
 * the country packs (currency, time zone, dialling code, example number);
 * the words from the dictionaries (countryPages).
 */
export type CountryPage = { slug: string; code: Exclude<CountryCode, "CM">; exampleAmount: number };

export const COUNTRY_PAGES: CountryPage[] = [
  { slug: "nigeria", code: "NG", exampleAmount: 15000 },
  { slug: "south-africa", code: "ZA", exampleAmount: 249.99 },
  { slug: "ghana", code: "GH", exampleAmount: 180 },
  { slug: "kenya", code: "KE", exampleAmount: 1500 },
  { slug: "zimbabwe", code: "ZW", exampleAmount: 12.5 },
];

export const COUNTRY_SLUGS = COUNTRY_PAGES.map((c) => c.slug);
export const countryPageFor = (slug: string) => COUNTRY_PAGES.find((c) => c.slug === slug) ?? null;
export const countryFacts = (code: CountryCode) => getCountryPack(code);
