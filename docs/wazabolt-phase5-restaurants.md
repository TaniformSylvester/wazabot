# WazaBolt — Phase 5 report: Restaurants

Phase 5 of `WAZABOLT_EXPANSION_PLAN.md` starts with restaurants, built 24 October 2026 on the same
app, orders, payments, documents and WhatsApp assistant.

Owner decisions applied:
- **Dine-in: open bills per table.**
  - A waiter opens a bill on a table and adds rounds of dishes during the meal; each round goes to the kitchen.
  - The customer pays at the end, and several payments are allowed (split bills).
  - The bill closes once paid in full and the table becomes free.
- **A kitchen screen with a Kitchen role.**
  - Kitchen staff see only the kitchen screen (and Team, to leave).
  - A Kitchen account **counts as a user** on the plan.
- **Priced extras** per dish (e.g. "Fried plantain" 500 FCFA), plus a free-text note per dish ("no pepper").
- **All plans.** The module is open on every plan; the existing limits on products, sales a month and users still apply. No price changed.

## 1. What's implemented

- **Module "Restaurant".**
  - On by default for businesses registered as restaurants.
  - Owners and admins switch it on or off under Settings → Modules, or from the floor page.
  - Menu: Restaurant → Floor and bills, Kitchen, Tables.
- **Tables** (owners/admins): name, area and seats.
  - A table is switched off rather than deleted, so past bills keep it.
  - Names are unique.
- **Menu.** Dishes are products.
  - The product form gets an Extras panel when the module is on: up to 20 extras, each with a name and a price of 0 or more, names unique.
  - Categories group the menu.
- **Floor** (refreshes every 15 s):
  - Each table is shown as free or with its open bill (number, total, opening time, dishes, guests, rounds ready).
  - "Open a bill" on a free table.
  - Takeaway and delivery orders in progress, with WhatsApp orders flagged for checking.
- **Bill / order page.**
  - **Rounds:** the dishes in each kitchen round, with the round's status. Dishes not yet sent are listed apart, with a "Send to the kitchen" button.
  - **Adding dishes:** from a menu picker — search, category, option, extras, quantity, note. It shows a live total, and the database prices everything again from the menu.
  - **Removing a dish:** needs a reason and is audited.
    - Agents can remove a dish until the kitchen starts it; after that only owners and admins can.
    - Its stock comes back.
    - It's refused if more was already paid than the new total.
  - **Payments:** the existing payment panel (several payments, refunds, voids, receipts).
  - **Closing:** "Close the bill" works only when the bill is paid in full.
  - **Printing:** "Print the bill" opens the order's printable invoice, which now shows extras and notes.
- **Takeaway and delivery orders.**
  - Dishes come from the menu.
  - A customer is optional for takeaway and required for delivery (with address, rider phone and delivery fee).
  - The order goes straight to the kitchen. When every round is ready, a takeaway or delivery order becomes "Ready".
- **Kitchen screen** (refreshes every 8 s):
  - Tickets oldest first: table or service type, order number, round, dishes, quantities, extras and notes.
  - Each ticket shows minutes waiting and turns red after 20.
  - One tap moves a ticket: Start → Ready → Served.
  - No prices or customer details: the database function only returns those fields.
- **Kitchen role.**
  - Invited from Team; the role is offered when the module is on.
  - Kitchen staff are redirected to the kitchen screen from any other page.
  - They can't read orders, customers, products or anything else (RLS: `is_business_member` excludes them, like teachers).
- **WhatsApp assistant.**
  - Product lookups and the pre-fetched catalog now include a dish's extras with their prices.
  - `createOrder` accepts extras by name, a note per dish, and a service type (takeaway or delivery; delivery needs the address).
  - For a restaurant, the order is recorded as a restaurant order that **waits as pending** until staff check it and send it to the kitchen. Dine-in isn't taken on WhatsApp.
  - The prompt tells the assistant to offer extras when they fit, include their price, ask takeaway or delivery, and say the team confirms.
- **Orders pages:** the order detail page shows extras and notes and links to the bill; the printable invoice/receipt shows them too.

## 2. Files

- **Database:**
  - `supabase/migrations/20261024120000_restaurant.sql` (new).
  - `supabase/tests/restaurant.sql` (new, 9 checks).
  - `package.json` (`test:db`, `test:e2e:restaurant`).
  - `types/supabase.ts` (regenerated).
  - `types/database.ts`: Kitchen role, service types, ticket statuses.
- **Data and actions:**
  - `lib/data/restaurant.ts`: floor, bill, menu, kitchen queue.
  - `lib/actions/restaurant.ts`: tables, open bill, add dishes, send to kitchen, remove a dish, close, takeaway/delivery, move ticket.
  - `lib/restaurant/extras.ts`.
  - `lib/modules.ts`, `lib/auth/dal.ts` (kitchen redirect), `lib/actions/team.ts`, `lib/actions/form.ts` (WB440 and other errors).
  - `lib/validation/app.ts` (extras), `lib/data/queries.ts` (order lines and products with extras).
- **Pages:**
  - `app/[lang]/dashboard/restaurant/` — floor, `tables/`, `new/`, `orders/[id]/` and `kitchen/`.
  - Product pages (extras), team page (Kitchen role), order detail and printable document (extras and notes).
- **Components:**
  - `components/restaurant/menu-picker.tsx` and `extras-editor.tsx`.
  - `components/app/product-form.tsx`, `components/app/form.tsx` (`useFormResult`).
  - `components/dashboard/sidebar-nav.tsx`, `config/dashboard-nav.ts`.
- **Assistant:**
  - `lib/ai/tools/registry.ts` (extras in searchProducts; restaurant orders in createOrder).
  - `lib/ai/claude.ts` (extras in the pre-fetched catalog).
  - `lib/ai/prompts/system-prompt.ts`.
- **Messages:** `messages/en.ts`, `messages/fr.ts`.
- **Tests:**
  - `tests/unit/restaurant-extras.test.ts`.
  - `tests/e2e/restaurant.e2e.mjs` (new, 29 checks).
  - `tests/e2e/ai.e2e.mjs` section 2d, and `tests/e2e/fake-anthropic.mjs`.
- **Docs:** this file, and `WAZABOLT_EXPANSION_PLAN.md`.

## 3. Database changes (one additive migration)

- **Kitchen role:**
  - New `business_role` value `kitchen`.
  - `is_business_member()` now excludes kitchen staff, as it does teachers, so every existing policy hides business data from them.
  - Invitations and role changes accept the role.
  - New function `can_use_kitchen()`.
- **Modules:** `business_modules` and `set_business_module()` accept `restaurant`.
- **New tables:**
  - `restaurant_tables`: RLS, members read, admins write, no delete.
  - `kitchen_tickets`: members read; changed only through functions.
- **Products:** `products.extras` (jsonb, shape checked by `valid_extras()`).
- **Order lines:** `order_items.extras`, `note`, `ticket_id`.
- **Orders:**
  - `orders.service_type`, `table_id`, `guests`, `bill_closed_at`.
  - At most one open bill per table (unique index).
- **Functions:**
  - `restaurant_open_order`, `restaurant_add_items`, `restaurant_send_to_kitchen`, `restaurant_remove_item`, `restaurant_close_bill` (WB440 if unpaid), `set_ticket_status`, `kitchen_queue`.
  - Each checks the role. Prices and extras come from the menu, and stock is applied per line.
- **Nothing existing is changed:** orders without a service type behave exactly as before.

## 4. Environment variables

None new.

## 5. Setup

1. Run `supabase/migrations/20261024120000_restaurant.sql` in the Supabase SQL Editor.
2. Deploy.
3. **For a restaurant:**
   - Add the tables (Restaurant → Tables).
   - Add extras to dishes (Products).
   - Invite the cooks with the Kitchen role (Team).

## 6. Tests performed

- **SQL** (`supabase/tests/restaurant.sql`, 9 checks):
  - Module, tables, extras validated.
  - A bill on a table, with extras priced from the menu (not the client), stock taken and a kitchen ticket.
  - One open bill per table; unknown extras refused; second round.
  - **The cook** sees tickets with dishes, extras, notes and table — no prices or customers, and no other table. Tickets only move forward. The cook can't cancel or add.
  - Removing dishes: stock back, audited, admin needed once started.
  - Closing only when paid in full (two payments); the table frees up.
  - Takeaway ready when the kitchen is done; delivery needs a customer.
  - A WhatsApp order waits for staff, and sending it confirms it.
  - Another business is refused.
  - Kitchen accounts count as users.
  - The migration also applies cleanly to a fresh database.
- **SQL, all suites:** every check passes.
- **Unit:** extras helpers and form validation (the form keeps extras it doesn't show). All unit tests pass.
- **End to end** (`tests/e2e/restaurant.e2e.mjs`, 29/29):
  - A restaurant's menu.
  - Tables added (duplicate refused).
  - A dish with extras saved from the product form.
  - A bill opened on T1, with the picker pricing 2 × (5,000 + 500) + 1,000 = 12,000; round 1 sent.
  - A cook invited with the Kitchen role lands on the kitchen screen. The ticket shows dishes, extras and the note with no prices. Other pages send the cook back. The ticket moves to Preparing, then Ready.
  - Round 2 added, and a dish removed (stock back).
  - Closing refused while unpaid; two split payments; closed; T1 free again.
  - The printable bill shows extras and the note.
  - Takeaway: an empty order is refused; the order goes to the kitchen and becomes Ready when the cook is done.
  - French; 390 px phones; no page errors.
- **End to end, assistant** (`tests/e2e/ai.e2e.mjs` 2d): a WhatsApp takeaway order with an extra priced from the menu (15,000 + 2,000) and a note, pending with no kitchen ticket. The assistant saw the extras with their prices.
- **Full regression of every suite:** see the hand-over message.

## 7. Known limitations

- **Kitchen accounts count as users.** A Free restaurant (1 user) can't add a cook without a bigger plan. Making kitchen accounts free, like teacher seats, would be a pricing decision for you.
- **The numbered invoice** (WazaBolt Docs "issue invoice" from an order) keeps the dish names and prices but not the extras' names. The extras' price is in the line. The printable bill and the order pages show the extras.
- **No table transfers or merging bills yet,** and no splitting of dishes between guests: split payment is by amount.
- **No reservations, and no kitchen printer.** The kitchen screen is a browser page; any phone or tablet works.
- **Delivery fee on WhatsApp orders** starts at 0; staff adjust it, as for other WhatsApp orders.

## 8. Outstanding and next steps

1. Owner: run the migration, then approve the push.
2. Decision: should kitchen accounts be free, like teacher seats?
3. Possible next steps:
   - Moving a bill to another table.
   - Splitting by dish.
   - Daily sales by dish and table in Reports.
   - Hotels, property or construction, once demand is confirmed.
