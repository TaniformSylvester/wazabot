# WazaBolt expansion — audit of the existing application

Audited 22 October 2026 on branch `claude/upbeat-bohr-kfyhe5` (commit `f82c612`), against a
local copy of the database with every migration applied. No secrets were read or changed:
environment variables are listed by name only.

**Verdict:** nothing blocks Phase 1 (WazaBolt Docs). The app already has multi-tenant
isolation enforced in the database, roles, customers with references, products with
variants, services, orders with payments, printable invoices and receipts per order, and a
working WhatsApp assistant. Docs can be built on top of these without a second database or
new paid services.

---

## 1. Architecture

| Layer | What is used | Notes |
| --- | --- | --- |
| Frontend | Next.js 16.3 App Router, React 19.2, TypeScript, Tailwind CSS 4, Radix UI, lucide icons | Server Components by default; client components only for interactive forms (POS, order builder, test chat). |
| Routing | Every page under `/[lang]` (`en`, `fr`); `proxy.ts` adds the locale, refreshes the Supabase session and redirects signed-out users away from `/dashboard` and `/admin`. | `/api/*` is excluded from the proxy. |
| Backend | Server Actions (`lib/actions/*`) and route handlers (`app/api/*`: WhatsApp webhook, crons, AI test chat, client errors). | No separate backend service. |
| Data access | `lib/data/queries.ts` (user's session, so RLS applies); `lib/supabase/admin.ts` (service role, server-only, used by the webhook, AI pipeline and crons). | Service-role key is never sent to the browser (`server-only` imports). |
| Database | Supabase Postgres; 20 migrations in `supabase/migrations`; SQL tests in `supabase/tests` (138 checks). | Migrations are applied by the owner in the Supabase SQL Editor, then the code is pushed. |
| Storage | Public bucket `product-images` (product photos, colour photos, business logos), private bucket for WhatsApp media (signed URLs). | |
| AI | Anthropic Claude (Haiku 4.5 by default) through `lib/ai/*`; rules layer answers simple questions without a model call; every tool is scoped to one business. | Costs logged per call (`claude_calls`). |
| WhatsApp | Official WhatsApp Business Platform (Cloud API) via `lib/whatsapp/graph.ts`; webhook with signature check; 24-hour window and templates handled. | A fake Graph API and a fake Anthropic API exist for tests (`tests/e2e/fake-*.mjs`). |
| Email | Resend (`lib/email/send.ts`) for team alerts; Supabase Auth for auth emails. | |
| Hosting | Vercel (auto-deploy from the branch), 2 crons (`vercel.json`). | |
| Tests | Vitest unit tests (22 files, 172 tests), SQL tests, 14 Playwright end-to-end suites against a local stack. | |

Environment variables used (names only): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, plus test-only overrides
(`ANTHROPIC_BASE_URL`, `WHATSAPP_GRAPH_API_BASE_URL`, `RESEND_API_URL`).

## 2. Existing features (inspected in code, not only in the UI)

**Accounts and businesses**
- Email sign-up with confirmation, login, password reset, invitations (`lib/actions/auth.ts`, `team.ts`).
- A business per sign-up (trigger), several businesses per user, business switcher.
- Business profile: name, industry (`retail, restaurant, hotel, fashion, beauty, real_estate, school, services, other`), city, address, phone, email, website, logo, description, opening hours, currency (default XAF), timezone, languages, receipt footer.
- 6-step onboarding.

**Roles and permissions** — enum `business_role` = owner > admin > agent > viewer; `has_min_role()` in RLS; `authorize()` in server actions; nav items hidden by role.

**Customers** — references `CUS-000001` (database counter, never reused), WhatsApp number unique per business, notes, tags, credit balance, purchase history, stats view (`customer_stats`), duplicate warnings, link a walk-in sale to a customer.

**Products and services**
- Products: price, cost price (private by column grants), unit, stock with history (`stock_movements`), low-stock threshold, categories, SKU, image, active flag.
- Variants: older one-option variants and the new colour × size combinations, each with its own stock, price difference and colour photo.
- Services (`services` table: name, duration, price) used by appointments.

**Orders, sales and payments**
- `create_order` / `create_sale` (one transaction: items with price snapshot, stock, payment).
- Orders `ORD-00001`, statuses with history, delivery details.
- Payments recorded by hand (cash, MTN MoMo, Orange Money, bank transfer, card, other): partial payments, balances, refunds, voids with a reason, duplicate protection.
- WazaBolt never marks a payment as received by itself: every payment is entered by a team member (`record_order_payment`). This already matches the rule in the brief.

**Existing documents** — `app/[lang]/dashboard/orders/[id]/document`: a printable invoice (`INV-00067`) and receipt (`RCT-00067`) per order, from the order snapshot and valid payments, "Save as PDF" through the browser's print dialog. Till sales have a printable receipt (`components/app/receipt.tsx`). There is no PDF file generation, no saved document record, no quotation, no guest tool.

**Business management** — POS till, expenses, reports with CSV export, dashboard metrics from real data, stock alerts, appointments with booking rules.

**WhatsApp AI and messaging**
- Inbox (`/dashboard/conversations`) with AI and human messages, Take Over / Return to AI, customer panel, media (images, voice notes with transcription), delivery ticks, 24-hour window, follow-up templates.
- AI assistant: English, French and Pidgin detection and replies, rules layer, catalog lookups (products, colours and sizes, stock), photo matching, orders, appointments, order status, human handover, never invents prices (validated against tool results), cost budgets per plan.
- Notifications (order status messages with consent), broadcasts (marketing templates, opt-out).
- Test chat (no WhatsApp needed) and a development mode with fake Graph/Anthropic servers.

**Plans and billing** — plans `free, boutique, starter, business, pro` defined in `config/economics.ts` and the `plans` table, enforced by database triggers (products, monthly sales, members); plan change requests paid by hand and approved in `/admin`; no payment provider integrated.

**Platform admin** — `/admin`: sign-ups, plan requests, margins, kill switch for AI per business.

**Internationalisation** — `messages/en.ts`, `messages/fr.ts` (typed: the French file must have every English key), locale-aware formatting (`lib/i18n/format.ts`).

## 3. Incomplete or limited features

| Area | State |
| --- | --- |
| Automations page | Shows "Coming soon" (an empty page, not a dead button). |
| Documents | Printable HTML only; no PDF file, no saved history, no quotations, no numbering by year, no templates, no guest tool. |
| Industry-specific screens | `industry` is stored but only changes onboarding copy; every business sees the same navigation. |
| Schools | Nothing exists (students, classes, marks, report cards, fees). |
| Hotels, restaurants, property | Nothing specific (appointments and services cover salons partly). |
| AI and documents | The assistant cannot send an invoice or receipt; outbound WhatsApp is text plus catalog photos. |
| Legal details | Company name, RCCM and NIU still pending (owner is waiting for them). |

No broken feature was found during this audit: the last full regression (12 end-to-end suites, 138 SQL checks, 172 unit tests) passed, apart from one flaky operations check that passed when re-run alone.

## 4. Database structure (public schema, 49 tables)

- Tenancy: `businesses`, `business_members`, `business_invitations`, `business_counters`, `audit_logs`, `users`, `platform_admins`, `platform_business_controls`.
- Catalog: `products`, `product_variants`, `services`, `stock_movements`.
- Sales: `customers`, `orders`, `order_items`, `order_payments`, `order_status_events`, `expenses`.
- Messaging: `conversations`, `messages`, `message_media`, `message_transcriptions`, `message_image_analyses`, `whatsapp_connections`, `whatsapp_credentials`, `whatsapp_templates`, `whatsapp_usage`, `whatsapp_number_history`, `notifications`, `notification_settings`, `broadcasts`, `broadcast_recipients`.
- AI: `ai_settings`, `ai_usage`, `ai_conversation_windows`, `claude_calls`, `faqs`, `knowledge_documents`.
- Appointments: `appointments`, `booking_settings`.
- Billing: `plans`, `subscriptions`, `subscription_payments`, `plan_change_requests`, `platform_alerts`.
- Languages: `languages`, `business_languages`, `country_packs`, `country_pack_languages`.

Every business table carries `business_id`, has RLS on, and is covered by `supabase/tests/tenant_isolation.sql`. Cost columns are hidden from staff by column grants. Counters (`business_counters`) give race-free numbers.

## 5. Security review

Good today:
- RLS on every business table; server actions call `authorize(minRole)` and never trust a business id from the browser (they use the signed-in member's current business).
- Service-role client is server-only; WhatsApp tokens are encrypted at rest; webhook signatures are checked.
- AI tools are scoped to one business, validated with Zod, and cannot change prices or confirm payments; replies quoting products the tools didn't return are blocked.
- Uploads are type- and size-checked (4 MB).

Concerns and actions:

| # | Concern | Action |
| --- | --- | --- |
| S1 | No general rate limiter for public endpoints (only AI and test-chat limits). A public document generator would be open to abuse. | Phase 1 adds a database-backed rate limit for the guest generator (no personal data kept: hashed IP, deleted after a day). |
| S2 | Logos and product photos are in a public bucket. Fine for catalog images, not for private documents. | Phase 1 stores no PDFs at all: business documents are rendered on demand from an immutable database snapshot, behind the member's session. |
| S3 | No Content-Security-Policy header. | Recommended later (low risk today: no user HTML is rendered). |
| S4 | The admin sign-ups list broke at ~400 businesses (fixed on 13 Oct). | Done. |
| S5 | School records (Phase 3) will need stricter rules than shop data (minors' data, parents' access). | Plan: separate role checks (teacher / school admin), results published explicitly, no public URLs. |

## 6. Reusable components and code

- UI: `components/app/ui.tsx` (PageHeader, Panel, TableWrap with mobile cards, StatusBadge, EmptyState, formatMoney/formatDate), `form.tsx` (ActionForm, fields with server errors), `print-button.tsx`, `copy-button.tsx`.
- Order builder pattern (`order-builder.tsx`) and the colour/size picker (`option-picker.tsx`) for document line items.
- Data: `listCustomerOptions`, `listSellableProducts`, services queries, `getOrder`, payments.
- Validation helpers (`lib/validation/app.ts`: money, counts, optional text), `lib/actions/form.ts` (FormState, `dbError`).
- Counters pattern (`business_counters` + locked update) for document numbers.
- i18n structure and formatting; brand assets (logo, fonts in `assets/fonts`).

## 7. Implementation priorities

1. **Docs engine** (calculations, labels EN/FR, 3 templates × 3 types, PDF) shared by every channel.
2. **Guest generator** at `/[lang]/tools/documents` (no sign-up, no storage, rate-limited).
3. **Business documents** (saved, numbered, statuses, customer/product/service integration).
4. Phase 2: link documents to orders and recorded payments; receipts from verified payments only.
5. Phase 3: schools as an optional module with adaptive navigation.
6. Phase 4: assistant requests documents through the same engine.

## 8. Risks and dependencies

| Risk | Mitigation |
| --- | --- |
| PDF rendering on Vercel (time, memory, bundle size). | `@react-pdf/renderer` (MIT, pure JavaScript, no browser needed): a 3-page document renders in ~0.6 s locally. Fonts bundled (Inter, OFL licence). No paid service. |
| Plan entitlements for saved documents change what Free users get. | Not enforced until the owner sets the numbers (the code reads them from config; `null` = unlimited). |
| Proposed plan names in the brief (Free, Starter, Business, AI add-on, School) differ from the live plans (Free, Boutique, Starter, Business, Pro). | Prices and plan names stay as they are until the owner decides; see the plan document. |
| Migrations are applied by hand. | Each phase ships one additive migration; the owner runs it before the code is pushed. No destructive changes. |
| Deploys happen on push. | Commits stay local until the owner approves the push. |
| School calculations differ between schools (out of 20 / 100, coefficients, terms). | Configurable rules plus unit tests on the calculation module before any UI. |
