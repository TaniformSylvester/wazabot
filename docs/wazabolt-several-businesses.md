# Several businesses under one login (29 October 2026)

**What it is.** One owner can now run several businesses from the same WazaBolt account: for example a shop in Douala and a restaurant in Bamenda. Each business is fully separate:

- its own products, customers, orders, documents and reports;
- its own team;
- its own WhatsApp number;
- its own plan.

The owner moves between their businesses with the name at the top of the dashboard (the switcher that invited team members already used).

Branches of one business (several locations sharing products and customers) are the next phase. They're not part of this change.

## Adding a business

1. **Add a business**, in the side panel under the account card (or on the "not part of a business" page).
2. Enter a name and choose the type (shop, school, restaurant, other). The type sets up the right tools, as at sign-up.
3. The new business is set up like a sign-up: Free subscription, AI settings, the owner as Owner, and the same country, currency, time zone and reply languages as the owner's latest business.
4. The dashboard opens on the new business and its setup (the school, restaurant or shop steps).

## One Free business per owner

Each owner gets **one** business on the Free plan. If the owner already has a Free business:

- the page says so, names that business, and asks for a paid plan (Boutique, Starter, Business or Pro), monthly or yearly, with a phone number;
- the business is created with a **plan request**, exactly like a plan change from Billing. The WazaBolt team gets the usual email and arranges payment;
- until WazaBolt approves the plan, the business **opens on Billing only**. Every other page leads back to Billing, and its actions are refused on the server. Billing says why, shows the pending request, and lets the owner change or cancel it;
- the owner's other businesses work as usual meanwhile;
- once the request is approved in **Admin → Plan requests**, the business opens on its setup.

If the paid plan later lapses and the business drops back to Free, it goes back to Billing only. It can't become a second Free business that way.

When the owner has no Free business (for example their first one moved to a paid plan), the next business is Free and opens straight away.

A safety cap of 20 businesses per login applies. More needs WazaBolt.

## Changes

- **Migration** `20261029120000_multi_business.sql`. It's additive: one column and two functions, and no data changes.
  - `businesses.needs_paid_plan`: set on a business added while its owner already had a Free one.
  - `create_business(name, type, plan, interval, phone)`: a security-definer function, for signed-in users only. It enforces the rules above and files the plan request.
  - Error codes: `WB450` (too many businesses), `WB451` (one Free business per owner).
- `lib/auth/dal.ts`:
  - The current business now carries `planId` and `awaitingPaidPlan`.
  - `requireBusiness` keeps such a business on Billing.
  - `authorize` refuses its actions, except the Billing ones.
- `lib/actions/businesses.ts`: `createBusiness`. It notifies the WazaBolt team of the plan request and opens the new business.
- `lib/auth/active-business.ts`: the switcher cookie helper, now shared by Team and the new action.
- New page `/dashboard/businesses/new`, the **Add a business** link, and the Billing notice, in English and French.
- The AI languages page now uses `requireBusiness`, like every other dashboard page.

## Tests

- **SQL** (`supabase/tests/multi_business.sql`, 9 checks):
  - anonymous callers are refused;
  - there is one Free business per owner, and a second needs a paid plan;
  - the name, type and interval are validated;
  - the business is set up like a sign-up, with its plan request (plan, interval, phone);
  - the data stays separate;
  - a new Free business is allowed once no other is Free;
  - other users never see these businesses.
- **E2E** (`tests/e2e/businesses.e2e.mjs`, 21 checks), with a real sign-up:
  - an owner with a Free shop adds a restaurant with a paid plan;
  - the restaurant stays on Billing with its pending request, and other pages lead back to Billing;
  - the switcher moves between the two, and their data stays apart;
  - after approval, the restaurant opens on its own setup;
  - with no Free business left, a new one is Free and opens straight away (in French).
