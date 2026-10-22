# WazaBolt Docs — Phase 1 report

Phase 1 of `WAZABOLT_EXPANSION_PLAN.md`: a free guest generator and saved business documents
(invoices, receipts, quotations), on one document engine. Built 22 October 2026.

## 1. What's implemented

**Document engine** (`lib/documents/`)
- One data model (`types.ts`) for every channel; Zod validation (`schema.ts`).
- Calculations in whole minor units, half-up rounding per line and for tax (`calc.ts`): line discount %, document discount (amount), tax rate, total, and for receipts the amount received and balance. FCFA has no decimals; EUR/USD have 2.
- Printed labels in English and French, money and dates written the local way (`labels.ts`).
- PDF renderer (`pdf/render.tsx`, `@react-pdf/renderer`): 3 templates — Classic (serif, stamp and signature areas), Modern (dark header, green total), Minimal — for each of the 3 types. A4, rows never split across pages, totals kept together, "Page x of y" and the number on every page, Draft/Void stamps, long names and words wrapped.
- On-screen preview (`components/documents/document-preview.tsx`) with the same data, labels and totals.

**Guest generator** — `/en/tools/documents`, `/fr/tools/documents` (linked in the site footer and sitemap)
- Choose the type and template, the document language and currency, enter the business (with logo), the customer, the lines, dates, discount, tax, payment (receipts), notes and terms; live preview; Download PDF and Print. Phones switch between the form and the preview.
- Nothing is saved: the PDF is made by `POST /api/documents/guest` and sent back. Business details can be remembered on the visitor's own device if they tick the box (browser storage, never sent until they make a PDF).
- Safety: Zod validation (100 lines max, text lengths), 1.6 MB request cap, logo ≤ 1 MB re-encoded by `sharp` (a file that isn't really an image is refused), 30 PDFs per hour per visitor (hashed IP, rows deleted after a day; in-memory fallback if the database can't be reached).
- After the download, a short invitation to create a free account (the PDF is never blocked).

**Business documents** — Dashboard → Documents (new menu item, staff and up)
- List with search (number or customer), type and status filters, pagination; overdue invoices and expired quotations shown as such.
- Editor: business details from the profile (plus the NIU/RCCM set in Documents settings), customer picked from existing customers (details filled in), products (each variant / colour × size on its own line) and services at today's prices, all the guest fields.
- Save draft (no number) → Issue: number from a locked counter (`INV-2026-000001`, `REC-…`, `QUO-…`), document frozen (database trigger). Quotations become Sent, then Accepted / Rejected. Duplicate (new draft linked to the original). Void with a reason (owners and admins), kept and audited. Drafts can be deleted, issued documents can't.
- Receipts can only be issued by owners and admins (a receipt states that money was received); they need the amount and the payment method.
- PDF download and Print (opens the PDF) rendered on demand from the saved snapshot — no files stored.
- Settings (owners and admins): prefixes, year on/off, digits, default template, language, days to pay, tax rate and name, notes, terms, NIU/RCCM.
- Customer profile: a Documents panel with their documents and a "New invoice" link.

**Fix found during this work (existing bug):** since the phone layout change of 13 October, every dashboard table also showed the phone column labels on desktop ("Phone+237…", "Purchases0" in Customers). The labels are now limited to phones (`components/app/ui.tsx`); the documents e2e suite checks both widths.

## 2. Files

Created
- `WAZABOLT_EXPANSION_AUDIT.md`, `WAZABOLT_EXPANSION_PLAN.md`, `docs/wazabolt-docs-phase1.md`
- `lib/documents/types.ts`, `calc.ts`, `labels.ts`, `schema.ts`, `editor-state.ts`, `server.ts`, `pdf/render.tsx`
- `lib/data/documents.ts`, `lib/actions/documents.ts`
- `components/documents/document-editor.tsx`, `document-preview.tsx`, `business-editor.tsx`, `status.ts`
- `app/[lang]/(marketing)/tools/documents/page.tsx`, `app/api/documents/guest/route.ts`
- `app/[lang]/dashboard/documents/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`, `[id]/pdf/route.ts`, `settings/page.tsx`
- `supabase/migrations/20261018120000_documents.sql`, `supabase/tests/documents.sql`
- `tests/unit/documents.test.ts`, `tests/e2e/documents.e2e.mjs`
- `assets/fonts/inter-latin-{400,600,700}-normal.woff` (Inter, SIL OFL)

Modified
- `messages/en.ts`, `messages/fr.ts` (docs texts, dashboard.documents, nav, validation and error keys)
- `config/dashboard-nav.ts` (Documents item), `config/site.ts` + `app/sitemap.ts` (footer link, sitemap)
- `components/app/ui.tsx` (table labels on phones only), `components/app/form.tsx` (`ActionButton` optional confirm)
- `app/[lang]/dashboard/customers/[id]/page.tsx` (Documents panel)
- `lib/actions/form.ts` (`document_locked` error), `next.config.ts` (font files traced into the PDF routes)
- `package.json` / `package-lock.json` (`@react-pdf/renderer` 4.9.0, test scripts), `types/supabase.ts` (generated), `assets/fonts/README.txt`

## 3. Database changes (one additive migration)

`20261018120000_documents.sql`: tables `documents`, `document_settings`, `document_counters`, `guest_document_requests`; functions `issue_document`, `void_document`, `set_quotation_status`, `guest_document_allowed`, trigger `documents_guard`; RLS policies and column grants. No existing table is altered; nothing is deleted.

## 4. Environment variables

None new. The guest rate limit uses the existing `SUPABASE_SERVICE_ROLE_KEY` (server only) and `CRON_SECRET` (as a hashing secret).

## 5. Setup

1. Run `supabase/migrations/20261018120000_documents.sql` in the Supabase SQL Editor.
2. Deploy the code (Vercel installs `@react-pdf/renderer`; the font files are bundled with the PDF routes).
3. Optional: each business sets its numbering and NIU in Dashboard → Documents → Numbering and defaults.

## 6. Tests performed

- Unit (`tests/unit/documents.test.ts`, 20 tests): totals, line and document discounts, tax, rounding (FCFA and EUR), fractional quantities, receipts' balance, formatting, validation, PDF rendering of all 9 template × type combinations (one page each), 70-line documents over 3–4 pages with long names and unbroken words, stamps, safe file names.
- SQL (`supabase/tests/documents.sql`, 12 checks): numbering per type and year, custom numbering, immutability (edit, delete, direct status/number writes refused), quotation statuses, receipts' requirements, void with reason and audit log, roles (agent, viewer), another business, guest limiter.
- End-to-end (`tests/e2e/documents.e2e.mjs`, 42 checks): guest invoice/receipt/quotation PDFs, logo, validation messages, invitation, nothing saved, API refusals (422, 413, fake image), 30/hour limit per visitor, phones; business draft → issue → PDF, duplicate, void, quotation accepted, receipt with MoMo reference, settings numbering, search and filters, delete draft, customer profile, phones, French, and the table-label fix.
- Full regression of the existing suites (see the hand-over message for the results of this run).

## 7. Known limitations

- Invoices don't record payments yet (Phase 2): Partly paid / Paid statuses exist in the database but aren't reachable from the UI; a receipt is a standalone document issued by an owner or admin.
- Documents aren't linked to orders yet (Phase 2); the existing per-order printable invoice and receipt still work as before.
- No "send by WhatsApp / email" yet (Phase 2 and 4): download and print only.
- Only the business's own currency for business documents; guests can choose XAF, XOF, NGN, EUR, USD, GBP.
- Saved documents aren't limited by plan yet: the owner decides the Free plan limit (see the plan document).
- The column header isn't repeated on continuation pages of very long PDFs (rows and totals never split).

## 8. Outstanding and next steps

1. Owner: run the migration, then approve the push.
2. Owner decision: limit on saved documents for the Free plan (or none).
3. Phase 2: invoices from orders, payments recorded against invoices, receipts generated only from recorded payments, statements, sending documents on WhatsApp.
