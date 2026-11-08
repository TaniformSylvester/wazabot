# Countries: Cameroon, Zimbabwe, Nigeria, South Africa, Ghana and Kenya (8 November 2026)

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
| Nigeria | naira (NGN), whole naira | Africa/Lagos | English | +234, local 080X XXX XXXX (070, 080, 081, 090, 091) |
| South Africa | rand (ZAR), with cents | Africa/Johannesburg | English | +27, local 06X/07X/08X XXX XXXX |
| Ghana | cedi (GHS), with pesewas | Africa/Accra | English | +233, local 02X/05X XXX XXXX |
| Kenya | shillings (KES), whole shillings | Africa/Nairobi | English | +254, local 07XX/01XX XXX XXX |

- **Sign-up** asks for the country, with Cameroon as the default.
- **Settings → Business → Change the country** lets the owner or an admin change it, but **only before the first sale, invoice or expense** (WB470). Changing the currency afterwards would mislabel those records. Languages the business already uses are kept.
- **Phone numbers:** a local mobile number gets **the business's** country code (customers, a new customer at the till, a student's guardian, the shop page's WhatsApp link). Numbers typed with + or 00 are kept as typed. Local formats overlap (07… is a mobile in Zimbabwe, Kenya and South Africa), so the business's country decides: 0712 345 678 is +254 in Kenya and +263 in Zimbabwe.
- **Amounts:** shown with the currency's decimals (`formatAmount`), for example "15,000 FCFA" / "15 000 FCFA" or "12.50 USD". Prices and payments are stored with two decimals, as they always were.

## Plans: FCFA in Cameroon, US dollars everywhere else (9 November 2026)

- **Who pays in dollars:** every business outside Cameroon (Zimbabwe, Nigeria, South Africa, Ghana, Kenya) pays its WazaBolt plan in US dollars (`planCurrencyFor` in `config/economics.ts`), whatever its shop's own currency. Its products, sales and receipts stay in naira, rand, cedi, shillings or dollars. No local payment gateway is needed.
- **Prices** (`LOCAL_PLAN_PRICES`): Boutique **$5**, Business **$12**, Multi-shop **$25** a month. Yearly is 10 months for 12: $50, $120, $250.
- **Payment:** by bank transfer. Billing tells the business that the WazaBolt team will send the bank details; the site shows no account number. The team's email and the plan requests page give the amount in USD, "by bank transfer", and the amount and method are filled in for the approval.
- **Payments** are recorded in FCFA for a business in FCFA and in US dollars for every other business (trigger `subscription_payments_currency`, function `subscription_payment_currency`). Top-ups and setup fees stay in FCFA.
- **Only the plans are sold in dollars.** The AI add-ons, top-ups, bundles, extra shops and the setup fee are FCFA only, so they aren't offered to a business paying in dollars; the server refuses them (`not_in_currency`), and the team can't set a setup fee on it.
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
5. Its businesses pay their plans in US dollars automatically. To charge in another currency instead, change `planCurrencyFor` and `subscription_payment_currency()` together, and add the prices to `LOCAL_PLAN_PRICES` and the rate to `FCFA_PER_UNIT`.

## Tests

- **Unit:** `tests/unit/countries.test.ts` covers packs, sign-up, phone numbers, amounts, the dollar prices and the margin report.
- **SQL:** `supabase/tests/countries.sql` covers a Zimbabwe sign-up, cents, who can change the country, the lock after a sale, and payments in the business's currency.
- **E2E:** `tests/e2e/countries.e2e.mjs` covers sign-up in Zimbabwe, a product at 12.50 USD, a sale of 25.00 USD with its receipt, a +263 customer, the shop page, the lock, plans in dollars (request, the team's email, approval by bank transfer, the payment in USD), and a Cameroon business moving before its first sale.
