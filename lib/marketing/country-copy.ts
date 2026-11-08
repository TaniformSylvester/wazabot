import "server-only";

import { countryFacts, type CountryPage } from "@/config/countries";
import { catalogFor } from "@/lib/billing/price";
import type { Locale } from "@/lib/i18n/config";
import type { CountryCode } from "@/lib/i18n/country-packs";
import { formatAmount } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";

/** "Africa/Johannesburg" → "Johannesburg". */
const cityOf = (timezone: string) => timezone.split("/").pop()!.replace(/_/g, " ");

/** The plans as sold outside Cameroon (US dollars), cheapest first. */
export function usdPlans() {
  return catalogFor("USD")!.plans;
}

/** The words that change from one country to another, for format() in the countryPages strings. */
export function countryVars(locale: Locale, t: Messages, code: CountryCode, page?: CountryPage) {
  const pack = countryFacts(code);
  const name = t.countryPages.names[code];
  const usd = (n: number) => formatAmount(n, "USD", locale);
  const [p1, p2, p3] = usdPlans().map((p) => usd(p.monthlyPrice));
  return {
    country: name.name,
    inCountry: name.in,
    theCountry: name.the,
    currencyName: name.currency,
    cities: name.cities,
    city: cityOf(pack.timezone),
    dial: pack.dialCode,
    phone: pack.phoneExample,
    example: page ? formatAmount(page.exampleAmount, pack.currency, locale) : "",
    p1,
    p2,
    p3,
    from: p1,
  };
}
