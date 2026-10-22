# WazaBolt expansion — architecture and phases

Companion to `WAZABOLT_EXPANSION_AUDIT.md`. WazaBolt is extended, not rebuilt: every new
module lives in the same Next.js app and the same Supabase database, isolated per business
by Row Level Security, and reuses the existing roles, customers, products, services, orders
and payments.

## 1. Target structure

| Module | Status | Contents |
| --- | --- | --- |
| A. WazaBolt Business | Exists | Accounts, businesses, customers, products/services, orders, payments, POS, expenses, reports. Extended with modules per business (§5). |
| B. WazaBolt AI | Exists | WhatsApp inbox, AI assistant (EN/FR/Pidgin), notifications, broadcasts. Extended in Phase 4. |
| C. WazaBolt Docs | **Phase 1–2** | One document engine for guests, the dashboard and (later) WhatsApp. |
| D. WazaBolt Schools | Phase 3 | Optional module: students, classes, subjects, assessments, report cards, fees. |
| E. Industry modules | Phase 5 | Hotels, restaurants, salons, property, construction, built on the same module switch. |

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | PDFs are made with `@react-pdf/renderer` (MIT) on the server, in the same Vercel functions. | Pure JavaScript (no headless browser, no extra service, no fee); handles A4, repeated table headers, page numbers and page breaks; ~0.6 s for a 3-page document. |
| D2 | One engine in `lib/documents/`: data model, calculations, EN/FR labels, templates, PDF. Guests, the dashboard and the WhatsApp assistant all call it. | The brief forbids separate engines; one set of calculations is easier to test. |
| D3 | Amounts are calculated in whole minor units (FCFA has none; other currencies 2 decimals) with half-up rounding per line and for tax. | Deterministic totals, identical in the preview, the PDF and the database. |
| D4 | Business documents are **not stored as PDF files**. An issued document keeps an immutable snapshot (business, customer, items, totals) in the database; the PDF is rendered on demand behind the member's session. | No storage cost, no public file URLs, nothing to clean up; the same PDF every time. |
| D5 | Numbers are given when a document is issued (drafts have none), from a locked per-business, per-type, per-year counter: `INV-2026-000001`. Prefix, year and padding are configurable per business. | Concurrency-safe, no gaps from abandoned drafts, unique per business and type. |
| D6 | Issued documents can't be edited (database trigger). Corrections = void (with a reason, audited) + duplicate into a new draft. | Auditable history, as required for financial documents. |
| D7 | Guest documents are processed in memory only: nothing is saved, logos are re-encoded by `sharp` and discarded. A database rate limit (hashed IP, 1 day retention) caps guest PDFs. | No personal data kept for visitors; abuse protection that works across serverless instances. |
| D8 | Previews are HTML that mirror the PDF templates and use the same calculations and labels; the PDF is the reference output. | Instant preview on phones (most mobile browsers can't show a PDF inline). |
| D9 | Plan limits for saved documents are read from config and default to "no limit" until the owner sets them. | Changing what Free users get needs the owner's approval. |

## 3. Data model (Phase 1 migration, additive only)

- `document_settings` (one row per business): prefixes (`INV`, `REC`, `QUO`), include year, padding, default template, default language, default notes and terms, default tax rate.
- `document_counters` (business, type, year → last number), updated with a row lock.
- `documents`: business, type (`invoice | receipt | quotation`), status, number, template, language, currency, issue date, due / valid-until date, customer (optional link) + customer snapshot, business snapshot, items (JSON lines with optional product / variant / service links), discount, tax rate, totals, notes, terms, payment details for receipts, created by, issued at, voided at / by / reason, duplicated from.
- RPCs: `issue_document`, `void_document`, `set_document_status` (quotation sent / accepted / rejected), `duplicate_document`. Each checks the caller's role, writes `audit_logs`.
- `guest_document_requests` + `guest_document_allowed()` for the guest rate limit (service role only).

Statuses: invoices `draft → issued → (partially_paid → paid, Phase 2) | voided`, overdue shown when past the due date and not paid; quotations `draft → sent → accepted | rejected`, expired shown after the valid-until date; receipts `issued | voided`.

Permissions: viewers read; agents create drafts, issue invoices and quotations; owners and admins issue receipts and void documents (a receipt states that money was received, so only people allowed to record payments can issue one).

## 4. Phases

**Phase 0 — audit and plan.** Done: this document and the audit.

**Phase 1 — WazaBolt Docs.** Built (22 Oct 2026): see `docs/wazabolt-docs-phase1.md`.
1. Engine: types, Zod validation, calculations, labels EN/FR, 3 templates (Classic, Modern, Minimal) for receipts, invoices and quotations, PDF renderer, unit tests.
2. Guest generator `/[lang]/tools/documents`: type → template → business → customer → items → preview → PDF download / print; logo upload; no storage; rate limit; invitation to sign up after the download.
3. Dashboard → Documents: list with search and filters, editor (existing customers, products with variants, services), save draft, issue, duplicate, void, PDF download and print, settings for numbering and defaults.
4. Tests: unit (calculations, rounding, long content, multi-page PDF), SQL (numbering, immutability, permissions, tenant isolation), end-to-end (guest and business flows).

**Phase 2 — business integration.** Create an invoice from an order; record payments against an invoice (reusing order payments where the invoice comes from an order); receipts generated only from recorded payments; statements per customer; send a document on WhatsApp (as a PDF message, inside the 24-hour window or with an approved template).

**Phase 3 — schools.** Module switch per business (`business_modules`), adaptive navigation (a school sees Students, Classes, Subjects, Results, Report cards, Fees, Documents). Configurable grading (out of 20 / 100, coefficients, weights, grade boundaries, terms) in a tested calculation module; marks entry by teachers; results published explicitly before parents can see them; report cards through the Docs engine (individual and bulk); fees reuse documents and payments. New roles or role scopes for teachers.

**Phase 4 — WhatsApp AI and documents.** Tools `requestInvoice` / `requestReceipt` that only return documents of the verified customer for an existing order, rendered by the same engine and sent as WhatsApp documents; every action logged on the conversation; human handover unchanged.

**Phase 5 — industry modules.** Hotels (rooms, reservations), restaurants (menu, bills), property (properties, tenants, rent receipts), construction (projects, estimates), built on the module switch, services, documents and payments. Only after demand is confirmed.

## 5. Modules and navigation (from Phase 3)

`business_modules (business_id, module, enabled_at)` with modules such as `commerce`, `ai`, `docs`, `school`, `hotel`. The dashboard navigation filters items by enabled modules and role (today it filters by role only). Defaults come from the business category chosen at sign-up; owners can switch modules on or off in Settings.

## 6. Plans and entitlements

Today: Free, Boutique (5,000 FCFA), Starter (10,000), Business (25,000), Pro (50,000), defined in `config/economics.ts` and the `plans` table. The brief proposes Free, Starter, Business, an AI add-on and a School module. Proposal, **for the owner to decide** (nothing changes until then):
- Keep the current plans and prices.
- Add entitlements per plan: `maxSavedDocumentsPerMonth` (Docs), `school` module access, and later an AI add-on for Boutique.
- Guest documents stay free and unlimited within the rate limit.

## 7. Costs

| Item | Cost |
| --- | --- |
| PDF rendering | Vercel function time only (~0.5–1 s per PDF). No storage (D4). |
| Guest rate limit | One small table, rows deleted after a day. |
| New dependencies | `@react-pdf/renderer` (MIT), Inter font files (OFL). No paid service. |
| WhatsApp documents (Phase 2/4) | Meta charges per conversation as today; documents sent inside the 24-hour window are free service messages. |

## 8. Rules followed

No rebuild, no removed features, no branding change, no duplicate tables, no paid dependency, no secrets in code, no fake data in production flows, no button without an action, additive migrations only (run by the owner), no push without the owner's approval.
