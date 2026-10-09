# WazaBolt V2 — audit and implementation plan

Sales, stock, customers and money, usable without WhatsApp. This records the
Phase 0 audit, what each phase reused or added, how it was verified, and what
is still open. Phases follow the brief's order (§2.5).

## Phase 0 — Existing application (audit)

| Area | What exists | V2 decision |
| --- | --- | --- |
| Frontend | Next.js 16 App Router, `app/[lang]/…` (en/fr), Server Components + Server Actions, Tailwind, shared UI in `components/app/ui.tsx` and `components/app/form.tsx` (`ActionForm`, fields, `DeleteButton`) | **Reuse** everything; new pages follow the same patterns |
| Backend | Server Actions in `lib/actions/*`, reads in `lib/data/queries.ts`, every write re-checks the role (`authorize(min)`) | **Reuse**; add `sales`, `payments`, `expenses` actions and `lib/data/reports.ts` |
| Database / auth | Supabase Postgres + Auth; every table has `business_id`; RLS via `has_min_role(business, role)`; roles owner > admin > agent > viewer; security-definer RPCs for multi-step writes | **Reuse**; all V2 rules live in SQL |
| Products | Products + variants, price, stock, low-stock threshold, photos, categories (text), stock taken by orders (`apply_order_stock`), search/filter | **Modify**: cost price, unit, stock ledger, archive instead of delete |
| Customers | Customers with WhatsApp number, language, tags, notes; created by WhatsApp or by hand | **Modify**: totals, credit, payments, history |
| Orders | `orders` / `order_items` with `create_order` (prices from the catalog), statuses, manual `payment_status` | **Modify**: orders are the sales ledger (POS sale = delivered order, channel `pos`); payments become records |
| Dashboard | WhatsApp/AI metrics, setup guide, stock alerts, recent orders | **Modify**: business overview on top, WhatsApp metrics below |
| Payments | Only a manual `payment_status` field; billing payments for WazaBolt plans (separate) | **Create** `order_payments` (manual, `provider` column ready for an API) |
| WhatsApp | Webhook, inbox, AI replies, notifications (`lib/notifications`), broadcasts | **Keep untouched**; core does not depend on it |
| i18n | `messages/en.ts` / `fr.ts`, typed; formatting helpers | **Reuse**; add FCFA label |
| Tests | SQL tests (`supabase/tests`), Playwright e2e per stage, Vitest unit | **Reuse**; add `pos_inventory.sql`, `pos.e2e.mjs` |

Technical debt that affected the MVP: payment status was editable by hand
(now derived from payment records); deleting products with history; costs had
no place to live; amounts displayed as "XAF".

Deviation from the brief (agreed by design, not by necessity): **Category**
stays a text field on products with a filter, rather than a separate table —
the catalog, the AI search and the filters already use it, and a table would
add a migration and a screen without a workflow that needs it. **Sale** and
**SaleItem** are the existing `orders` / `order_items` (a POS sale is a
delivered order), so WhatsApp orders and till sales share one ledger.

## Database changes

| Migration | Adds |
| --- | --- |
| `20261013120000_pos_inventory.sql` | `products.cost_price`, `unit`; `stock_movements` + trigger (every stock change, with reason, before/after, user); `adjust_stock`; `order_items.unit_cost` (cost at the time of sale); `orders.channel`, `amount_paid`, `client_key` (no duplicate sales); `order_payments` (+ status derived from them); `create_sale` (one transaction); `record_order_payment`, `record_customer_payment` (oldest first, never more than owed); `customer_stats` view; `expenses`; `businesses.receipt_footer`; `sales_by_day`, `product_sales` |
| `20261014120000_cost_privacy.sql` | Cost prices readable only by owners/admins at the database level (column grants + `product_costs`, `order_item_costs`) |
| `20261015120000_plan_limits.sql` | Boutique plan (5,000 FCFA, no AI); per-plan limits (products, monthly sales, users, report days, expenses/profit) enforced by triggers; `business_plan_limits()` for the dashboard; grace until 1 Dec 2026 for existing businesses |
| `20261016120000_customer_order_management.sql` | Customer IDs (CUS-000001) with backfill; returns, refunds, payment voids, payment date/note; delivery details; order status history; SKU on order items; link a customer to a walk-in sale; last contact from messages/orders/payments; `balance_due` |

Money is `numeric(14,2)`; sale prices and costs are copied onto each item when
sold, so later price changes don't rewrite history. Totals are computed in the
database from the catalog, never taken from the screen.

## Phases — status and verification

| # | Phase | Status | Verified by |
| --- | --- | --- | --- |
| 1 | Data model | Done | `pos_inventory.sql` (ledger, isolation, validation), all earlier SQL suites still pass |
| 2 | Products & inventory | Done | e2e Tests 1–2; SQL: opening stock, every change has a reason, never negative, cashier can't adjust, archive not delete |
| 3 | Customers & credit | Done | SQL: the brief's example (100,000 − 40,000 = 60,000; − 25,000 = 35,000), several credit sales and payments, zero balance, nothing taken when nothing owed; e2e Test 7 |
| 4 | POS / sales | Done | e2e Tests 4–6 (cash, MoMo, credit, part payment, double tap, oversell); SQL: multi-item, discount, Orange Money + bank transfer, catalog prices, refused sale leaves nothing |
| 5 | Receipts & history | Done | e2e: receipt contents (business, contact, number, date, customer, items, total, method, **reference**, status, branding), print view, filters |
| 6 | Expenses | Done | e2e Test 8; reports/profit include them |
| 7 | Reports | Done | e2e Test 9 (figures checked against the records), CSV export |
| 8 | Dashboard | Done | e2e Test 9 — every figure from persisted data |
| 9 | Settings & permissions | Done | e2e: receipt logo/footer, cashier (no costs, profit, reports, expenses, discounts; CSV 403); SQL: same rules in the database |
| 10 | Mobile UX | Done | e2e Test 11 at 390 px and 768 px; desktop throughout |
| 11 | Demo data | Done | `supabase/seed/demo_mj_fashion.sql`: create, rerun (no-op), reset, delete — only the demo (marked), never a real business |
| 12 | Full QA | Done | Every suite: SQL, unit, and all e2e suites (auth, dashboard, operations, WhatsApp, AI, appointments, notifications, broadcasts, POS) |
| 13 | Prepare WhatsApp | Done (boundary only) | `lib/core/events.ts`: `sale.completed`, `payment.recorded`, `credit.outstanding`; no channel registered; unit-tested |

## Risks / dependencies

- **Payments are recorded by hand**; nothing is verified with MTN or Orange.
- **Profit is an estimate**: items sold without a cost price count as zero
  cost (flagged on the dashboard and in reports).
- **Column grants**: a new column on `products` / `order_items` must be
  granted to `authenticated` explicitly (see the cost-privacy migration), and
  signed-in reads of those tables must name their columns — `select *` (or an
  insert asking for the whole row back) is refused. The app always names
  columns; the e2e helpers were updated the same way.
- **Deploy order** for the cost-privacy migration: deploy the code first, then
  run the migration (the new code works with or without it; the old code
  would lose access to product pages once it runs).
