# WazaBolt — Docs and School plan entitlements

Built 22 October 2026 from the owner's decisions on teacher seats, School module limits and the
Free plan's saved-document limit. **No price, plan or subscription was changed.** Nothing is
charged automatically.

Owner decisions applied:
- **Teachers** don't count toward the plan's users. Each school gets **30 free teacher accounts**, on every plan. Owners, admins, agents and viewers still count. Parents and students have no accounts, so they never count.
- **School module:** open to every plan; no separate School subscription.
- **Student limits:** Free 50 · Boutique 200 (same as Starter) · Starter 200 · Business 500 · Pro unlimited (fair use).
- **Report cards:** every plan has student management, marks entry and report cards. Whole-class report cards from Boutique/Starter up. Advanced school reports on Business and Pro.
- **Free plan documents:** 20 saved business documents, **lifetime total**. Drafts, issued and voided documents count. Deleting a draft frees its place. Issued documents can't be deleted. School fee invoices and their receipts don't count (they belong to the school allowance). Guest documents are never saved.
- **Report card allowance (separate from documents):** students with published report cards per term, the same number as the student limit. Printing or sending the same published report card again doesn't count again.
- **Everything is configurable:** every figure is a column of the `plans` table.

## 1. What's implemented

| Plan | Saved documents | Active students | Report cards (students / term) | Whole-class report cards | Advanced school reports | Teacher accounts |
|---|---|---|---|---|---|---|
| Free | 20 | 50 | 50 | — | — | 30 |
| Boutique | unlimited | 200 | 200 | ✓ | — | 30 |
| Starter | unlimited | 200 | 200 | ✓ | — | 30 |
| Business | unlimited | 500 | 500 | ✓ | ✓ | 30 |
| Pro | unlimited | unlimited (fair use) | unlimited (fair use) | ✓ | ✓ | 30 |

**Enforced in the database** (triggers and functions, so no page, API or script can go around them):
- **Teacher seats** (WB416):
  - Checked when a teacher joins, is invited, or a member's role changes to or from Teacher.
  - Pending invitations hold a seat.
  - Renewing an expired invitation is checked like a new one.
  - Accepting an invitation doesn't count the teacher twice.
- **Users** (WB413, as before) now exclude teachers.
- **Students** (WB415):
  - Checked when a student is added, or set back to active.
  - Withdrawn and graduated students don't count.
  - Editing an active student is never blocked.
- **Saved documents** (WB417):
  - Checked on every new document: invoices, receipts, quotations, order invoices, payment receipts and duplicates.
  - Fee invoices and fee receipts are skipped.
  - Issued documents were already undeletable, and voiding keeps the record, so deleting can't free places. Only drafts can be deleted.
- **Report cards** (WB418):
  - Checked when results are published.
  - Counts distinct students with live published results in the term, across classes.
  - Withdrawing and publishing again doesn't double count.
- **Grace:** like the other Free limits, these wait for the business's `free_limits_from` date.
  - Existing businesses: 1 December 2026.
  - New businesses: the day they register.
  - Teacher seats apply to everyone now.

**Enforced on the server (routes):**
- The report card PDF route refuses a whole class (403) without whole-class report cards. One student's report card always prints.
- The school reports CSV route refuses without advanced school reports (403). Owners and admins only.

**Shown in the app** (EN/FR):
- **Billing** usage panel:
  - Shows saved documents.
  - For schools, also shows active students and teacher accounts, with a note that teachers aren't users.
  - The plan cards list the new entitlements from the `plans` table.
- **Team:** users and teacher seats shown as two separate meters.
- **Documents:**
  - Shows "X of 20 saved documents".
  - At the limit, an upgrade notice replaces the New buttons and the editor.
- **School overview:** usage meters for active students, teacher accounts and report cards for each term.
- **Students:** shows "X of 50". At the limit, an upgrade notice replaces "Add a student".
- **Results:**
  - On Free, the whole-class PDF and Print buttons are replaced by a notice naming the cheapest plan that includes them.
  - Shows report card usage for the term.
- **School reports** (new, menu item for owners and admins):
  - For a term, each class shows: students, published or not, average, highest, lowest, pass rate, fees billed, paid, outstanding and % collected.
  - Each subject per class shows: coefficient, teacher, average, highest, lowest and pass rate.
  - Whole-school totals, two CSV downloads, and an upgrade notice on other plans.
- **Website pricing cards:** saved documents and school students per plan.
- **Error messages** (EN/FR) for WB415–WB418 point to Billing.

The plan named in "included from the … plan" messages is read from the configuration, never hard-coded.

## 2. Files

- **Database:**
  - `supabase/migrations/20261021120000_school_plan_limits.sql` (new).
  - `supabase/tests/school_plan_limits.sql` (new, 12 checks).
  - `package.json` (`test:db`, `test:e2e:school-limits`).
- **Configuration:**
  - `config/economics.ts`: the new fields for each plan, mirrored from the `plans` table. Prices unchanged.
  - `config/plans.ts`: public fields and `cheapestPlanWith`.
  - `lib/billing/margins.ts`: the admin config-drift warning now compares the new columns too.
- **Data:**
  - `lib/data/queries.ts`: `getEntitlements`, `limitInForce`, `bulkReportCardsAllowed`, `schoolReportsAllowed`.
  - `lib/data/school.ts`: `termReportCardUsage`, `getSchoolReport`.
  - `lib/school/reports.ts` (new): the pure report builder.
  - `types/supabase.ts` (regenerated).
- **Errors:** `lib/actions/form.ts` (WB415–418), `messages/en.ts`, `messages/fr.ts`.
- **UI:**
  - `components/app/usage-meter.tsx` (new).
  - Billing, team, documents (list and new), school overview, students (list and new), results pages and the PDF route.
  - `app/[lang]/dashboard/school/reports/page.tsx` and `export/route.ts` (new).
  - `config/dashboard-nav.ts`.
  - `components/marketing/pricing-card.tsx`.
- **Tests:**
  - `tests/unit/school-reports.test.ts` (new).
  - `tests/unit/margins.test.ts`.
  - `tests/e2e/school-limits.e2e.mjs` (new, 41 checks).
- **Docs:** this file, and `docs/wazabolt-schools-phase3.md` (outdated limitation struck).

## 3. Database changes (one additive migration)

- **`plans` gets 6 columns:**
  - `max_documents`, `max_students`, `max_report_card_students`: null = unlimited.
  - `max_teachers`: default 30.
  - `has_bulk_report_cards`, `has_school_reports`.
  - These are filled for the 5 existing plans.
- **New functions:**
  - `_plan_entitlements`, `_documents_used` and `_report_card_students`: internal.
  - `business_entitlements(business)`: any member, teachers included.
  - `term_report_card_usage(term)`.
- **Replaced:**
  - `business_plan_limits`: same shape; users now exclude teachers.
  - `enforce_member_limit`: adds teacher seats.
  - `publish_school_results`: adds the report card allowance.
- **New triggers:**
  - Role change on `business_members`.
  - Renewal of an expired invitation.
  - Students (insert or status change).
  - Documents (insert).
- **Nothing is deleted or rewritten,** and existing data isn't touched.
  - A Free business already over a limit keeps everything.
  - It can't add more until it deletes drafts or withdraws students, or moves to a bigger plan.
  - This only starts after its grace date.

To change a limit later: `update plans set max_documents = 30 where id = 'free';`. Then update `config/economics.ts` to match; the admin margin page warns while they differ.

## 4. Environment variables

None new.

## 5. Setup

1. Run `supabase/migrations/20261021120000_school_plan_limits.sql` in the Supabase SQL Editor.
2. Deploy.

Nothing to configure afterwards.

## 6. Tests performed

- **SQL** (`supabase/tests/school_plan_limits.sql`, 12 checks):
  - Plan values and unchanged prices.
  - A Free school invites a teacher but not a second user.
  - The teacher cap counts pending invitations (cap lowered to 2 to test it).
  - Expired invitations free a seat; renewing one is checked.
  - Accepting doesn't double count; users exclude teachers.
  - Role changes in both directions, each against its own limit.
  - 50 students: the 51st is refused; a withdrawn student frees a place; reactivating over the limit is refused; edits are never blocked.
  - Grace.
  - 20 documents, counting drafts, issued and voided:
    - the 21st is refused;
    - an issued document can't be deleted;
    - a deleted draft frees a place;
    - fee invoices and fee receipts are created at the limit and don't count.
  - Report cards:
    - over the term allowance is refused;
    - withdraw and re-publish doesn't double count;
    - the same student in two classes counts once.
  - Pro is unlimited.
  - Another business can't read our entitlements.
- **SQL, all suites:** every check passes (172 before, plus these 12).
- **Unit:**
  - `school-reports.test.ts`: class, subject and whole-school figures computed by hand; the plan config matches the decisions; the cheapest plan with a feature.
  - The drift check covers the new columns.
  - All 217 tests pass.
- **End to end** (`tests/e2e/school-limits.e2e.mjs`, 41 checks): a brand-new Free school with limits in force.
  - **Students:** usage meters; the 50th student is added; at 50 the Add button gives way to a notice. A student added at the same moment elsewhere is refused on the server with the message.
  - **Teachers:** a teacher is invited while the one user seat is taken; an agent is refused; the invitation holds a seat.
  - **Report cards:** no whole-class PDF on Free (the route returns 403); one student's PDF works. Publishing counts 2 students; downloading again doesn't count again.
  - **School reports:** shown as an upgrade notice on Free; the CSV export returns 403.
  - **Documents:** 19 of 20 shown. A document saved at the same moment as the 20th is refused with the message. At 20, the notice replaces the New buttons and the editor. Fee invoices are still billed at the limit.
  - **Billing:** shows documents, students and teacher seats.
  - **Moved to Business:** whole-class PDF, school reports with fee collection, both CSVs, no document limit, students can be added again; price unchanged.
  - French, 390 px phones, no page errors.
- **Full regression of every existing suite:** see the hand-over message.

## 7. Known limitations

- **Fair use on Pro is a manual review.** There's no automatic cap; the WazaBolt team watches usage.
- **Order invoices, payment receipts and duplicates count** toward Free's 20 documents, like any saved document. Recording a payment never creates a document by itself, so the limit never blocks a payment.
- **Provisional report cards aren't counted.** Unpublished results can be printed one student at a time on Free and are marked "Provisional". The allowance applies to published report cards, which are what parents receive.
- **Existing Free businesses over 20 documents or 50 students,** once their grace date passes (1 December 2026), keep everything but can't add more without deleting drafts, withdrawing students or upgrading. The billing banner already announces the Free limits from that date. This new part isn't in that announcement's text yet.
- **Teacher seats have no grace period.** No school is near 30 today.
- **The "On the Free plan, report cards download one at a time" note names Free.** It only shows on plans without whole-class report cards, which today is only Free.

## 8. Outstanding and next steps

1. Owner: run the migration, then approve the push.
2. ~~Document-language fallback inconsistency~~: fixed 25 October 2026 (English for non-French businesses everywhere), see `docs/wazabolt-cleanups-oct2026.md`.
3. Possible next steps:
   - ~~Add the new Free limits to the grace-period banner text.~~ Done (see `docs/wazabolt-cleanups-oct2026.md`).
   - ~~A fair-use report for Pro schools in the admin pages.~~ Done (`/admin/fair-use`).
