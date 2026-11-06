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

## Plans in US dollars (7 November 2026)

- **Prices** (`LOCAL_PLAN_PRICES` in `config/economics.ts`): Boutique **$5**, Business **$12**, Multi-shop **$25** a month. Yearly is 10 months for 12: $50, $120, $250.
- **Payment:** by bank transfer. Billing tells the business that the WazaBolt team will send the bank details; the site shows no account number. The team's email and the plan requests page give the amount in USD, "by bank transfer", and the amount and method are filled in for the approval.
- **Payments** are recorded in the business's currency (trigger `subscription_payments_currency`). Top-ups and setup fees stay in FCFA.
- **Only the plans are sold in dollars.** The AI add-ons, top-ups, bundles, extra shops and the setup fee are FCFA only, so they aren't offered to a dollar business; the server refuses them (`not_in_currency`), and the team can't set a setup fee on it.
- **The team's margin report** counts dollar revenue in FCFA at `FCFA_PER_USD`.

## What is still in FCFA

- **The pricing page** (www.wazabolt.com/pricing) shows the Cameroon prices.
- **Prices in dollars for the AI add-ons, extra shops and a setup fee** are the owner's decisions, needed before the AI assistant launches in Zimbabwe.
- **The AI assistant's language guides** (`lib/ai/language/packs`) say "as used in Cameroon". The assistant isn't launched yet, so this needs revisiting before it is.

## Adding another country

1. Add it to `countryPacks` and `ACTIVE_COUNTRIES` (`lib/i18n/country-packs.ts`), with its local mobile format.
2. Add it to `SIGNUP_COUNTRIES` (`lib/validation/auth-rules.ts`) and to the names in the dictionaries (`auth.fields.countries`, `settings.countries`).
3. Write a migration adding its row to `country_packs` and `country_pack_languages`.
4. If its currency has decimals other than 0 or 2, update `currencyDigits` (`lib/i18n/format.ts`).
5. To sell plans in its currency, add its prices to `LOCAL_PLAN_PRICES` and its rate to `FCFA_PER_UNIT` (`config/economics.ts`). Without them, Billing shows FCFA and says the team will contact the business.

## Tests

- **Unit:** `tests/unit/countries.test.ts` covers packs, sign-up, phone numbers, amounts, the dollar prices and the margin report.
- **SQL:** `supabase/tests/countries.sql` covers a Zimbabwe sign-up, cents, who can change the country, the lock after a sale, and payments in the business's currency.
- **E2E:** `tests/e2e/countries.e2e.mjs` covers sign-up in Zimbabwe, a product at 12.50 USD, a sale of 25.00 USD with its receipt, a +263 customer, the shop page, the lock, plans in dollars (request, the team's email, approval by bank transfer, the payment in USD), and a Cameroon business moving before its first sale.
