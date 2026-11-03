# Plans v2: three plans, an optional AI add-on, trials (3 November 2026)

## Prices

All prices are in **`config/economics.ts`**, and the database tables mirror them (`plans`, `addons`, `bundle_prices`). The admin margin page warns if the two differ. To change a price, edit that file and write a migration that updates the tables.

| Plan | FCFA / month | Users | Shops | What it adds |
|---|---|---|---|---|
| Boutique | 3,000 | 1 | 1 | Products, stock alerts, sales, customer credit, receipts |
| Business | 7,500 | 3 | 1 | Expenses, estimated profit, reports, stock history, payment notes |
| Multi-shop | 15,000 | 10 | 3 (+5,000 FCFA/month each) | Everything in Business |

- **AI add-on** (any plan, none by default):
  - AI Basic: +5,000 FCFA a month for 300 conversations.
  - AI Plus: +12,000 FCFA a month for 1,000 conversations.
  - Top-up: 2,000 FCFA once, for 100 more conversations in the current usage period only.
- **Bundles** are data (`BUNDLE_PRICES`), not special cases: Business + AI Basic costs 11,500 instead of 12,500.
- **Annual billing:** pay 10 months, get 12.
- **Setup fee:** 0, or 10,000–25,000 FCFA, set per business by the WazaBolt team. It's collected with the first payment.
- **Trial:** a new business gets 14 days of Business, with no payment. There's one trial per owner, so a second business needs a plan.
- **AI trial** (once AI launches): 14 days or 50 conversations, whichever comes first, once per business.
- **No plan:** a trial or paid period that ended unpaid (the old "free" row). The business is **read-only**: everything can be seen and exported, nothing new is recorded, and Billing stays open.
- **Prices are shown** as "7 500 FCFA" in French and "7,500 FCFA" in English (`formatXaf`). Profit is always labelled "estimated" / « estimé ».

## The AI assistant: coming soon

`platform_settings.ai_assistant_launched` is off. While it's off:
- the AI is shown as "coming soon" / « bientôt disponible » on the pricing page and Billing;
- no add-on or AI trial can be requested (the database refuses it, WB460);
- the assistant doesn't answer customers.

The WazaBolt team switches it on in **Admin → Businesses → WhatsApp AI assistant**. Public pages pick the change up within 5 minutes.

The Meta fee notice ("WhatsApp (Meta) may charge your business directly for some messages. These fees are separate from WazaBolt.") must be accepted before the add-on or the AI trial. The acceptance is stored. It is never shown at sign-up.

## How it works

- **Gating:** `lib/billing/entitlements.ts`, through `canUse(access, feature)` and `getLimit(access, limit)`, over `business_features()` (`lib/billing/plan-access.ts`).
  - Users, shops and expenses are enforced by the database (WB413, WB452, WB414).
  - Read-only is enforced in `authorize()`, which every server action goes through.
  - Over a limit, the app shows an upgrade prompt with a "See plans" link (`ActionError`, `UPGRADE_ERRORS`), never an error.
- **Metering:**
  - `ai_usage_status()` gives the add-on's conversations plus this period's top-ups, or the AI trial's 50.
  - One conversation is one customer's 24-hour window in which Claude replied, and the count restarts each usage month.
  - When the allowance is used up, the team takes over and the owner can buy a top-up.
  - The hidden Claude budget is a share of what the add-on earns (`claudeBudgetFcfa`).
  - The real cost per conversation: `admin_ai_conversation_costs()`.
- **Payments:** recorded by hand. The owner asks on Billing, and the team approves with the MTN MoMo / Orange Money reference (Admin → Plan requests), or records a payment directly (Admin → Businesses). A payment provider plugs into `lib/billing/payments.ts` (`PaymentProvider`).

## Pricing to watch

At full use and worst-case Claude cost, the simulation (Admin → Pricing) shows:

| AI offer | Monthly margin | Annual margin |
|---|---|---|
| AI Basic | 66.9% | 60.9% |
| AI Plus | 75.5% | 71.2% |
| Business + AI Basic bundle | 59.4% | 51.9% |

The bundle falls below the 60% target because its 1,000 FCFA discount comes out of the AI's share (4,000 FCFA). The hidden budget still caps Claude spend there: replies get shorter, then the team takes over. A price change is the owner's decision.

## Migrations

- `20261103120000_plans_v2.sql`: plans, add-ons, bundles, trials, read-only, metering, admin functions. Existing businesses get a 30-day trial.
- `20261104120000_staff_plan_access.sql`: teachers and kitchen staff can read their business's plan.

## Tests

- **SQL:** `supabase/tests/plans_v2.sql` (28 checks), plus the older suites updated.
- **Unit:** `tests/unit/billing-plans.test.ts` (gating, limits, bundle and annual pricing, price format), `costs`, `margins` and `simulation` (AI offers).
- **E2E:** `tests/e2e/plans.e2e.mjs`: pricing, trial, Boutique and Business, read-only, admin controls, AI launch, the Meta notice.
