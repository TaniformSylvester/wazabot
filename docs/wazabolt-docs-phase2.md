# WazaBolt Docs: Phase 2 report

Phase 2 of `WAZABOLT_EXPANSION_PLAN.md` links documents to the business: orders, payments and customers, and adds sending documents on WhatsApp. Built 22 October 2026, on top of Phase 1 (`docs/wazabolt-docs-phase1.md`).

## 1. What's implemented

**Invoice from an order** (Orders → an order → **Issue invoice**)
- Makes a numbered invoice (`INV-2026-000001`) straight from the order. The lines (with colour/size and SKU), delivery fee, discount, total, customer and delivery address all come from the order in the database, never from the browser. The issue date is today in the business's time zone. The due date uses the "days to pay" setting.
- Each order has at most one live invoice. To correct it, void it and issue a new one. These invoices can't be duplicated.
- The order page then links to "Invoice INV-…". The invoice names the order (on screen, in the PDF and as a link).
- The existing printable invoice and receipt pages for orders still work. Their buttons are now labelled "Printable invoice" and "Printable receipt" so they aren't confused with the numbered invoice.

**Payments against invoices** (on the invoice page, staff and up)
- Payments are recorded by hand. Each one has an amount, method (cash, MTN MoMo, Orange Money, bank transfer, card, cheque or other), a reference, the date received and a note. A double click records it once. The database refuses more than the balance.
- An invoice made from an order uses the order's payments, so there is one ledger. A payment recorded on the invoice is an order payment, and a payment recorded on the order also pays its invoice.
- Other invoices have their own payments (`invoice_payments`).
- Invoice status follows the recorded payments on its own: **Issued → Partly paid → Paid**. "Overdue" is shown after the due date if it isn't paid.
  - The invoice and its PDF show "Paid" and "Balance due", and a paid invoice carries a green PAID stamp.
  - An invoice starts with nothing paid whatever its draft said. Only payments recorded by staff count. A customer saying they paid changes nothing.
- Owners and admins can void a payment recorded by mistake, with a reason. It stays in the history, struck through. An order's payments are voided on the order, as before.
- An invoice with payments can't be voided until its payments are voided.

**Receipts only from recorded payments** (**Make receipt** next to each payment, on the invoice and on the order)
- A receipt is made from one recorded payment that hasn't been voided, and is issued straight away (`REC-…`).
  - Its amount, method, reference and date are the payment's.
  - It also prints the invoice or order it pays, that document's total, what was paid up to and including this payment, and the balance left. "Paid in full" appears only when nothing is left.
- One live receipt per payment: a second click opens the same receipt.
- A payment that has a receipt can't be voided until the receipt is voided. The error names the receipt.
- Staff can make these receipts, because they are the people who record payments.
- Standalone receipts from Phase 1 (typed by hand, for money not recorded in WazaBolt) are kept, and only owners and admins can issue them.

**Customer statement of account** (Customers → a customer → Documents → **Statement**)
- A table of everything billed and paid, with dates and a running balance, then total billed, total paid and the balance due. You can choose a period ("From" empty = since the first transaction; earlier transactions become one opening balance) and the language (French or English).
  - **Billed:** orders that aren't cancelled or returned (an order with an invoice shows the invoice number), and issued invoices that have no order.
  - **Paid:** the recorded payments on those, not voided.
  - **Left out:** quotations, receipts (they repeat a payment) and anything voided.
- PDF download and Print use the same engine, fonts and template as the documents. The PDF has a header row on every page, "Page x of y", and is not stored.

**Send on WhatsApp** (issued invoices, receipts and quotations, plus statements)
- The PDF is rendered, uploaded to WhatsApp through the Graph API media upload, then sent as a document message with its file name and a caption ("Invoice INV-… — Business name") from the business's own connected number.
  - The send is recorded in the customer's conversation (the inbox shows the file with a link to the document), counted as a WhatsApp service message, and written to the audit log.
- It only works inside the 24-hour customer-service window. Outside the window the button is off and the panel explains why, and the server checks again.
  - Nothing is uploaded or sent and nothing is shown as sent. "Sent" appears only when WhatsApp accepted the message, and a refusal is shown and recorded as failed.
  - No document template is used yet (see limitations).
- Drafts and voided documents can't be sent. Documents with no customer, or customers without a WhatsApp number, say so.

**Bug found and fixed (Phase 1, in production):**
- After the server had rendered any PDF with a capital accented letter, later PDFs from the same server process could print "EC-2026-000009" instead of "REC-2026-000009". The text layer of those letters was also broken. Common triggers are the French "PAYÉ" or "ANNULÉ" stamps, or "FACTURÉ À" on every French invoice.
- Cause: the PDF library's font cache (fontkit) kept a glyph without its characters.
- Fix: `lib/documents/pdf/render.tsx` no longer caches glyphs that are fetched without characters. A unit test reproduces the bug: it fails without the fix and passes with it.

## 2. Files

Created
- `supabase/migrations/20261019120000_documents_phase2.sql`, `supabase/tests/documents_phase2.sql`
- `lib/documents/layout.ts` (what both renderers print around the lines), `lib/documents/statement.ts` (statement model, pure), `lib/documents/whatsapp.ts` (send a PDF on WhatsApp)
- `lib/data/statements.ts`, `lib/actions/document-links.ts`, `lib/payments/received.ts` (payment date and errors, shared by the payment forms)
- `components/documents/invoice-payments.tsx`, `whatsapp-panel.tsx`, `send-whatsapp.tsx`
- `app/[lang]/dashboard/customers/[id]/statement/page.tsx`, `statement/pdf/route.ts`
- `tests/unit/documents-phase2.test.ts`, `tests/e2e/documents-links.e2e.mjs`, `docs/wazabolt-docs-phase2.md`

Modified
- `lib/documents/types.ts` (Mobile money receipts, `related`, `invoicePaid`, paid stamp), `calc.ts` (paid and balance on invoices), `labels.ts` (EN/FR labels for links and statements), `pdf/render.tsx` (linked documents, statement PDF, font-cache fix)
- `components/documents/document-preview.tsx` (same layout helpers as the PDF)
- `lib/data/documents.ts` (business snapshot helper, payments, receipts, order invoice, WhatsApp state), `lib/actions/documents.ts` (shared snapshot; linked documents aren't duplicated; duplicated invoices start unpaid), `lib/actions/payments.ts` (helpers moved), `lib/actions/form.ts` (3 error keys)
- `lib/whatsapp/graph.ts` (`uploadMedia`, `sendDocument`)
- `app/[lang]/dashboard/documents/[id]/page.tsx` (payments, receipts, links, WhatsApp), `orders/[id]/page.tsx` (Issue invoice, receipts), `customers/[id]/page.tsx` (Statement link), `conversations/[id]/page.tsx` (sent documents)
- `components/app/payments-panel.tsx` (optional Receipt column)
- `messages/en.ts`, `messages/fr.ts`, `next.config.ts` (fonts traced into the customer routes), `package.json` (test scripts), `types/supabase.ts` (generated), `tests/e2e/fake-graph.mjs` (media upload)

## 3. Database changes (one additive migration)

`20261019120000_documents_phase2.sql`:
- **New table** `invoice_payments`. Members can read it. It is written only through the functions below.
- **New columns on `documents`:** `order_id`, `invoice_id`, `order_payment_id`, `invoice_payment_id` and `related` (snapshot). Existing rows keep NULL.
- **New indexes:** one live invoice per order, and one live receipt per payment.
- **Widened check:** the receipt payment-method check also accepts `mobile_money`.
- **Replaced functions** (same signature, `create or replace`):
  - `documents_guard`: links to a deleted customer, order or payment are cleared, and deleting a business still works. The paid amount follows payments only, and an invoice with payments can't be voided.
  - `issue_document`: staff can issue receipts made from payments, and an invoice starts with nothing paid.
- **New functions:** `create_order_invoice`, `record_invoice_payment`, `void_invoice_payment`, `create_payment_receipt`, plus the internal `_refresh_invoice_paid`, `_business_today` and `_customer_snapshot`.
- **New triggers:** an order's invoice follows the order's payments and refunds, and a payment with a live receipt can't be voided.

No data is changed or deleted, and no existing column is dropped.

## 4. Environment variables

None new. Sending uses each business's connected WhatsApp number (stored and encrypted as before) and the existing `SUPABASE_SERVICE_ROLE_KEY`, which stays on the server.

## 5. Setup

1. Run `supabase/migrations/20261019120000_documents_phase2.sql` in the Supabase SQL Editor.
2. Deploy the code.
3. Nothing to configure. A business needs its WhatsApp number connected to send documents.

## 6. Tests performed

- **Unit** (`tests/unit/documents-phase2.test.ts`, 11 tests):
  - Paid and balance on invoices.
  - Linked-document rows, "paid in full" and the paid stamp.
  - Statements: running balance, a period with an opening balance, same-day order, 2-decimal currencies, multi-page PDF in 3 templates, empty statement, safe file names.
  - Receipt and paid-invoice PDFs in 3 templates.
  - The font-cache bug.
- **Unit, full suite:** 203 tests pass.
- **SQL** (`supabase/tests/documents_phase2.sql`, 11 checks):
  - Invoice from an order (lines, delivery, discount, customer, total; one per order; none for cancelled orders).
  - Order payments through the invoice (once per key, never above the balance, partly paid → paid).
  - Receipts from payments (amount, method, reference, paid to date, balance, once per payment; none for a voided payment).
  - Payment-void rules.
  - Standalone invoice payments and voids.
  - No direct writes, and a draft can't claim to be paid.
  - Roles: viewer, agent, owner.
  - Another business is refused.
  - Deleting an order or a business.
- **SQL, all suites:** 161 checks pass.
- **End to end** (`tests/e2e/documents-links.e2e.mjs`, 43 checks):
  - Order → Issue invoice, and payments on the invoice and on the order.
  - Partly paid → Paid with stamp.
  - Make receipt, its PDF and its links; receipt-before-void rule.
  - Standalone invoice: over-payment refused, cheque, void rules, receipt.
  - Statement: rows, closing balance, period, PDF, French.
  - WhatsApp, against the local fake Graph API:
    - not connected; window closed (nothing sent);
    - invoice PDF uploaded and sent as a document with caption;
    - message recorded, counted and audited; shown in the conversation;
    - statement sent; drafts can't be sent.
  - 390 px phones; no page errors.
- **Full regression** of the existing e2e suites: see the hand-over message for this run's results.

## 7. Known limitations

- **No WhatsApp template yet.** Sending only works inside the 24-hour window. A document template needs a Meta-approved template with a document header, and its sample file must be uploaded through Meta's resumable upload. That is not built yet, so outside the window the button explains the rule instead of sending.
- **Real Graph API not tested from here.** Sending was tested against the local fake, not Meta's servers (no real number in this environment). Please try one send from the live site.
- **Standalone invoice payments aren't in Reports yet.** Sales reports and the dashboard count order payments as before. Order invoices are fine because their payments are order payments.
- **No customer balance on the profile.** The customer's balance on the profile page is unchanged (orders only). The statement includes standalone invoices.
- **Payments are recorded by hand.** WazaBolt doesn't check them with MTN or Orange. A reference typed in is not a verification.

## 8. Outstanding and next steps

1. Owner: run the migration, then approve the push.
2. Try "Send on WhatsApp" once on the live site with a customer who wrote in the last 24 hours.
3. Owner decisions still open: Free plan limit on saved documents; plan structure; legal name, RCCM and NIU.
4. Possible next steps:
   - a document template for sending outside the 24-hour window;
   - standalone invoice payments in Reports;
   - Phase 3 (schools) or Phase 4 (assistant sends a verified customer's invoice or receipt), as decided.
