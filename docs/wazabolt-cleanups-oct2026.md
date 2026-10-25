# WazaBolt — small cleanups (25 October 2026)

Four leftovers from earlier phases. No database migration: app code only.

## 1. Document language: one fallback

When neither the document settings nor the customer pick a language, every document now falls back the same way: **French for French-language businesses, English otherwise** (Pidgin and other languages included).

- Before: the new-document editor fell back to French, while order invoices, receipts, statements and report cards fell back to English.
- Now: the editor uses the shared `documentLanguage()` (`lib/data/documents.ts`), like statements and the database functions.
- Businesses that set a language in Documents → Settings are not affected.

## 2. Grace-period notice names every Free limit

The notice shown to existing Free businesses (dashboard banner and Billing) now also says:

- **Saved documents.** "…{products} products, {sales} sales a month, **20 saved documents** and 1 user…".
- **School limits, for schools only.** "For your school: up to 50 active students and report cards for 50 students, one at a time (no whole-class PDF)."

The numbers come from the plan in the database, not from the text. The closing line now reads "…or another plan to keep using more", because Boutique and Starter still cap students at 200, so "keep everything unlimited" was wrong for schools.

Code: `lib/billing/grace.ts`, used by `app/[lang]/dashboard/layout.tsx` and the Billing page.

## 3. Fair use report (WazaBolt team)

New admin tab **Fair use** at `/admin/fair-use`. It lists every school on a plan with no student limit (today: Pro), largest first. For each school it shows:

- active students;
- classes;
- teacher accounts;
- documents.

A school with more active students than the largest limited plan allows (Business, 500) is marked **"Above business"** for review. Nothing is capped automatically; the review stays manual, as decided.

The report shows counts only, never students, marks or documents. Like the other admin pages, it returns a 404 to anyone who isn't on the WazaBolt team.

Report-card counts aren't on the report. Reading them would mean loading every published result from the server, and active students already bound them.

Code: `lib/admin/fair-use.ts`, `app/[lang]/admin/fair-use/page.tsx`.

## 4. Invoice payments in Reports

Reports has a new **Invoice payments** panel. It shows money received on invoices outside orders, for the chosen period:

- typed invoices;
- school fee invoices, with their share shown as "of which school fees".

The panel gives the total, the split by payment method and the latest payments, each linked to its invoice. Voided payments are left out. A **CSV** download lists every payment with its date, invoice number, type, customer, amount, method and reference.

These payments are **kept apart from sales**. An order's invoice is paid through the order, so its payments are already in the sales figures; adding them here would count them twice.

Code: `invoicePaymentsBetween()` in `lib/data/reports.ts`, the Reports page, and the `invoice-payments` CSV type.

## Tests

- **Unit:** 222.
- **SQL:** unchanged and passing.
- **E2E:**
  - `plans`: the grace notice names 20 saved documents, with no school line for a shop.
  - `school-limits`: the grace notice includes the school's limits. Fair use lists the Pro school with 50 students as Normal, and marks it "Above business" at 501.
  - `documents-links`: Reports shows 15,000 on invoices, with the voided cheque left out. The CSV has one row, paid by Orange Money.
  - `ai`: fair use is a 404 for business owners and opens for the WazaBolt team.
  - `mobile`: the fair-use page fits a phone.
- **Full regression:** see the commit report.
