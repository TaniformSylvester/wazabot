# WazaBolt Schools — Phase 3 report

Phase 3 of `WAZABOLT_EXPANSION_PLAN.md`: an optional School module for nursery, primary and
secondary schools, built 22 October 2026 on the same app, database, documents engine and payments.

Owner decisions applied:
- **Plans:** School is open to all plans for now. No price or plan changed.
- **Teachers:** a new Teacher role.
- **Grading:** three grading presets (Francophone /20, Anglophone /100, Primary).
- **Parents:** parents receive results through the school (PDF or WhatsApp). There is no parent login.

## 1. What's implemented

**Modules and adaptive menu**
- Each business has modules: *Sales and stock*, *WhatsApp AI*, *Documents*, *School*.
  - A business registered as a school starts with School + Documents + WhatsApp AI.
  - Every other business keeps what it has today (Sales and stock + Documents + WhatsApp AI); nothing changes for existing businesses.
- Owners and admins switch modules on and off in Settings → Modules. Nothing is deleted; it only changes the menu.
- **The menu follows the modules.** A school sees General (dashboard, customers, documents), School (overview, students, classes and marks, results and report cards, school fees), WhatsApp & AI, and Settings. No till, products or orders unless Sales is switched on.
- A school without the Sales module opens on its School overview, with a setup checklist and key numbers (students, classes, results published, fees still due).

**Teacher role**
- Owners and admins invite teachers from Team (role "Teacher"), or change a member to Teacher.
- **What teachers can do:**
  - They see only the school pages: their subjects and classes, the marks of their classes, and the results of their classes.
  - They enter marks and comments only for the subjects they teach.
  - The class teacher also writes the class teacher's comment.
- **What is hidden from teachers:** customers, orders, payments, documents, fees, WhatsApp conversations and settings.
  - In the database, teachers are not "business members" for business data. Every existing table's rules therefore exclude them automatically.
  - Opening any other page sends them back to the school pages.
- Publishing results, setting up the school and billing fees stay with owners and admins. Staff (agents) register and enrol students.

**School settings**
- **Profile:** type of school, registration / authorisation number, motto and principal. The name, logo, address and phone come from the business profile.
- **Grading presets** (they fill the values; everything stays editable):
  - **Francophone:** marks /20, coefficients, 2 sequences per term (6 per year), ranking, grades A–E.
  - **Anglophone:** /100, continuous assessment 30 % + exam 70 %, grades A–F.
  - **Primary:** /20, no coefficients, no ranking.
- **Other grading settings:** what a missing mark counts as (left out, or 0), the pass mark, decimals, grade boundaries (one per line: minimum, grade, remark), the report card template (Classic / Modern) and language, and the student ID prefix.
- **Academic years:** one is the current year. Each year has terms, and each term has the assessments its mark is made of (name, weight, maximum). A new year can be created with the preset's terms and assessments.

**Classes, subjects, students**
- **Subjects** are kept as a school-wide list. Each class has subjects with a coefficient and a teacher, plus a class teacher.
- **Students** get a number (STU-000001, or the school's own prefix) and have a gender, date of birth, status (active / withdrawn / graduated), a class each year (one class per year) and notes.
- **Parent / guardian:** their WhatsApp number becomes a WazaBolt customer linked to the student. Fee invoices, receipts and report cards go to that customer.

**Marks**
- **Entry grid** (one subject, one term): a row per student, a column per assessment with its maximum, an absence tick, and the teacher's comment.
- The subject average updates as marks are typed. Out-of-range marks are flagged and can't be saved.
- **Database checks:** the right teacher (or an admin), the mark between 0 and the maximum, the student enrolled in the class, and results not yet published. Every save is in the audit log.

**Results and report cards**
- **Calculation** (`lib/school/grading.ts`) is pure and deterministic:
  - Subject average = weighted average of the assessments, on the school's scale. Missing marks are left out, or count as 0 if the school chooses. An absence counts as a missing mark.
  - Then: points = average × coefficient, and general average = Σ points / Σ coefficients of the subjects that have marks.
  - Grades come from the boundaries. Positions share ties (1, 2, 2, 4).
  - Class average, highest, lowest and pass count are also computed.
  - Rounding is half-up at the school's number of decimals.
- **Results page:** before publishing, results are computed live from the current marks and marked *provisional*. The class teacher and the principal write their comments there.
- **Publishing** (owners/admins) freezes the computed results as a snapshot.
  - It locks the class's marks and comments for that term.
  - Report cards are printed from the snapshot, so they never change afterwards.
  - Withdrawing (with a reason, audited) unlocks the marks so they can be corrected; then publish again. Withdrawn publications stay in the history.
- **Report cards** use the same PDF engine, fonts and footer as invoices.
  - Each card has: school header with logo, motto and registration; student details; marks per assessment; average; coefficient; points; grade; rank; teacher's comment per subject; totals; position; class statistics; pass result; class teacher's and principal's comments; signature boxes and a school-stamp box.
  - **Formats:** Classic or Modern, English or French. One student, or the whole class in one PDF (one page each). Download or print.
  - Unpublished report cards are stamped "Provisional".
- **Send to parent:** published report cards only, as a PDF on WhatsApp to the guardian's number. The Phase 2 rules apply: only within 24 hours of the parent's last message, and nothing is faked if WhatsApp isn't connected.

**School fees**
- **Fees per year:** name, amount, one class or the whole school, and a due date.
- **Bill students** (owners/admins) issues a numbered invoice (Phase 2 documents) per enrolled student who doesn't have one yet, addressed to the parent and naming the student, class and student ID. Billing twice never bills twice.
- **Payments and receipts** are the Phase 2 invoice payments and receipts (recorded by staff, never on a parent's word).
- **Tracking:** the fees page shows per fee the invoices, billed, paid and still due, plus balances by student. The student profile shows their fee invoices, paid amount and balance.

## 2. Files

Created
- `supabase/migrations/20261020120000_school.sql`, `supabase/tests/school.sql`
- `lib/modules.ts`, `lib/school/grading.ts`, `lib/school/presets.ts`, `lib/school/report-card.ts`, `lib/data/school.ts`, `lib/actions/school.ts`
- `components/school/marks-grid.tsx`, `student-form.tsx`, `filter-select.tsx`
- `app/[lang]/dashboard/school/page.tsx`, `settings/page.tsx`, `classes/page.tsx`, `classes/[id]/page.tsx`, `classes/[id]/marks/page.tsx`, `students/page.tsx`, `students/new/page.tsx`, `students/[id]/page.tsx`, `results/page.tsx`, `results/pdf/route.ts`, `fees/page.tsx`
- `tests/unit/school-grading.test.ts`, `tests/e2e/school.e2e.mjs`, `docs/wazabolt-schools-phase3.md`

Modified
- `lib/documents/pdf/render.tsx`: report cards.
- `config/dashboard-nav.ts`, `components/dashboard/sidebar-nav.tsx`, `mobile-nav.tsx`, `app/[lang]/dashboard/layout.tsx`: menu by module and role.
- `lib/auth/dal.ts`: teachers are kept to the school pages.
- `app/[lang]/dashboard/page.tsx`: a school without Sales opens on the School overview.
- `app/[lang]/dashboard/settings/page.tsx`: Modules panel.
- `app/[lang]/dashboard/team/page.tsx`, `lib/actions/team.ts`: Teacher role.
- `types/database.ts`: Teacher rank.
- `components/app/ui.tsx`: a Panel's `id` is now on the section, so links to `#…` scroll to it.
- `lib/actions/form.ts`: `results_published` error.
- `messages/en.ts`, `messages/fr.ts`: school, modules, roles and errors.
- `next.config.ts`: fonts for the school PDF routes.
- `package.json`, `types/supabase.ts` (generated).

## 3. Database changes (one additive migration)

`20261020120000_school.sql`:
- **Role:** a new enum value `teacher`.
- **Membership checks:**
  - `is_business_member()` now excludes teachers. Business data is hidden from them with no other policy changed.
  - New `is_business_staff()` (any member). New read policies let teachers see their own membership, their business row and its languages.
- **Team:** invitations and role changes accept `teacher` (`create_invitation` and `update_member_role` replaced, same signatures).
- **New tables:** `business_modules`, `school_settings`, `academic_years`, `school_terms`, `school_assessments`, `school_classes`, `school_subjects`, `class_subjects`, `school_students` (number from a counter), `school_enrollments`, `school_marks`, `school_subject_comments`, `school_term_comments`, `school_result_publications`, `school_fee_items`.
- **Changes to existing tables:**
  - `business_counters.student_seq` (new column).
  - `documents.student_id` and `fee_item_id` (new columns).
  - One live fee invoice per fee and student.
  - The documents guard lets these links be cleared.
  - A receipt for a fee payment names the student.
- **Functions:** `set_business_module`, `save_marks`, `set_school_comment`, `publish_school_results`, `withdraw_school_results`, `bill_school_fee`, and helpers.
- **Access rules (RLS):** every table has row-level security.
  - School setup: everyone in the school reads; owners and admins write.
  - Classes, students and marks: members, plus the class's own teachers.
  - Fees: members only (not teachers).
  - Marks and comments are written only through the functions.

No data is changed or deleted. Existing businesses keep their current menu.

## 4. Environment variables

None new.

## 5. Setup

1. Run `supabase/migrations/20261020120000_school.sql` in the Supabase SQL Editor.
2. Deploy.
3. **For a school:**
   - Settings → Modules → School: turn on. A business registered as a school has it on already.
   - School settings: choose a preset, then create the year.
   - Classes: add subjects and classes, with coefficients and teachers.
   - Team: invite teachers as "Teacher".
   - Students: register them.

## 6. Tests performed

- **Unit** (`tests/unit/school-grading.test.ts`, 11 tests):
  - Weighted averages on /20 and /100.
  - Missing marks and absences, both settings.
  - Half-up rounding without float drift.
  - Grades from boundaries; positions with ties.
  - Boundaries as text.
  - Class results with coefficients, without coefficients, and without ranking; determinism.
  - Presets.
  - Report cards PDF: 2 templates × 2 languages, one page per student, provisional vs published; safe file names; column headers.
- **Unit, full suite:** 214 tests pass.
- **SQL** (`supabase/tests/school.sql`, 11 checks):
  - Setup and modules.
  - Student numbers fixed; one class per year.
  - **Teacher isolation:** no customers, orders, documents, fees or team; only their class and students.
  - Marks: own subject only, 0..max, enrolled students only, no direct writes, corrections.
  - Comments by role.
  - Publishing locks marks and comments; withdraw with a reason; audit.
  - Teachers can't publish or change modules.
  - Fees billed once per enrolled student to the guardian (class or whole school); paid with invoice payments; receipts name the student. Agents can't bill.
  - Another business is refused.
  - Teacher invitations and role change.
- **SQL, all suites:** 172 checks pass.
- **End to end** (`tests/e2e/school.e2e.mjs`, 44 checks):
  - A school starts on its overview with its own menu.
  - Preset, settings, a wrong grade line is refused.
  - Year with terms and sequences.
  - A teacher invited and confined to school pages.
  - Subjects, classes, coefficients; students with a parent who becomes a customer.
  - Marks: out-of-range blocked, absences, live average, comments; another subject read-only.
  - Results: averages, ties and positions as computed by hand (13.71, 13.71, 8.64).
  - Comments by class teacher and principal; provisional PDF (3 pages, French name).
  - Publish → marks locked → one student's PDF; send refused when WhatsApp isn't connected; withdraw.
  - Fees billed once, in French, to the parent, and paid; teachers see no fees.
  - Modules on and off; French; 390 px phones; no page errors.
- **Full regression** of the existing suites: see the hand-over message for this run's results.

## 7. Known limitations

- **No parent or student login** (as decided). The school sends report cards (PDF or WhatsApp, within the 24-hour window).
- **No student photos on report cards yet.** The brief says "where permitted": that needs consent handling and private storage, so it wasn't built.
- **One teacher per subject per class.** Several teachers sharing a subject isn't supported yet.
- **No yearly report card.** Only per-term report cards; annual averages across terms and promotion decisions aren't computed yet.
- ~~**Teachers use plan seats.**~~ Decided and changed: teachers have their own free seats (30 per school, every plan). See `docs/wazabolt-plan-entitlements.md`.
- **Fee payments are recorded by hand,** like all payments (no MTN or Orange check). Fee payments on invoices without an order are not in the sales Reports yet (same as Phase 2).
- **Moving a class to the next year is done by hand.** Students are re-enrolled in the new year's classes one by one; there's no bulk promotion yet.

## 8. Outstanding and next steps

1. Owner: run the migration, then approve the push.
2. ~~Owner decisions~~ (teacher seats, school limits per plan, the Free plan's saved-document limit): decided 22 October 2026 and built — see `docs/wazabolt-plan-entitlements.md`.
3. **Possible next steps:**
   - Yearly averages and promotion.
   - Bulk move of a class to the next year.
   - Sending report cards to all parents of a class in one go.
   - Student photos with consent.
   - Phase 4 (WhatsApp assistant and documents).
