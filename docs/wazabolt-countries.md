# Countries: Zimbabwe, the second country (6 November 2026)

## What a country sets

A **country pack** decides a new business's:
- currency;
- time zone;
- reply languages;
- dialling code.

The packs live in two places, kept in step: `lib/i18n/country-packs.ts`, and the `country_packs` and `country_pack_languages` tables.

| Country | Currency | Time zone | Languages | Phone |
|---|---|---|---|---|
| Cameroon (default) | FCFA (XAF), no decimals | Africa/Douala | English, French, Pidgin | +237, local 6XX XX XX XX |
| Zimbabwe | US dollars, with cents | Africa/Harare | English | +263, local 07X XXX XXXX |

- **Sign-up** asks for the country, with Cameroon as the default.
- **Settings → Business → Change the country** lets the owner or an admin change it, but **only before the first sale, invoice or expense** (WB470). Changing the currency afterwards would mislabel those records. Languages the business already uses are kept.
- **Phone numbers:** a local mobile number gets its country's code. Numbers typed with + or 00 are kept as typed. The two formats can't be confused, because Cameroon mobiles start with 6 and Zimbabwe mobiles with 07 or 7.
- **Amounts:** shown with the currency's decimals (`formatAmount`), for example "15,000 FCFA" / "15 000 FCFA" or "12.50 USD". Prices and payments are stored with two decimals, as they always were.

## What is still in FCFA

- **WazaBolt's own plans:** the pricing page and Billing show FCFA. For a business outside Cameroon, Billing says prices in its currency are coming, and that the WazaBolt team will contact them about price and payment when they send a request.
- **USD prices** and a way to pay from Zimbabwe (bank transfer, or a provider such as Flutterwave) are the owner's decisions. They aren't built.
- **The AI assistant's language guides** (`lib/ai/language/packs`) say "as used in Cameroon". The assistant isn't launched yet, so this needs revisiting before it is.

## Adding another country

1. Add it to `countryPacks` and `ACTIVE_COUNTRIES` (`lib/i18n/country-packs.ts`), with its local mobile format.
2. Add it to `SIGNUP_COUNTRIES` (`lib/validation/auth-rules.ts`) and to the names in the dictionaries (`auth.fields.countries`, `settings.countries`).
3. Write a migration adding its row to `country_packs` and `country_pack_languages`.
4. If its currency has decimals other than 0 or 2, update `currencyDigits` (`lib/i18n/format.ts`).

## Tests

- **Unit:** `tests/unit/countries.test.ts` covers packs, sign-up, phone numbers and amounts.
- **SQL:** `supabase/tests/countries.sql` covers a Zimbabwe sign-up, cents, who can change the country, and the lock after a sale.
- **E2E:** `tests/e2e/countries.e2e.mjs` covers sign-up in Zimbabwe, a product at 12.50 USD, a sale of 25.00 USD with its receipt, a +263 customer, the shop page, the lock, the Billing notice, and a Cameroon business moving before its first sale.
