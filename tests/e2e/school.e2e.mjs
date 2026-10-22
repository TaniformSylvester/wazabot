/*
 * End-to-end test of WazaBolt Schools: a school's own menu, settings and
 * grading preset, academic year with terms and assessments, a teacher invited
 * with the Teacher role (school pages only, own subjects only), subjects with
 * coefficients, students with a parent's WhatsApp number, marks entry (ranges,
 * absences, read-only for other subjects), results with comments, publishing
 * (locks marks), report card PDFs, withdrawal, school fees billed as invoices
 * and paid, modules on/off, French and phones — against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:school
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB = process.env.DATABASE_URL;
if (!ANON || !DB) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY and DATABASE_URL");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim();
async function latestMail(to, subjectIncludes) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json();
    const m = list.messages?.find((x) => x.Subject.includes(subjectIncludes));
    if (m) return (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    await sleep(500);
  }
  return null;
}
const linkFrom = (mail) => (mail?.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&");
const until = async (fn, ms = 10000) => {
  for (let i = 0; i < ms / 250; i++) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
};
const pages = (buf) => (buf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  const main = page.locator("main");
  const nav = page.locator("aside nav").first();
  const settle = async (p = page) => {
    await p.waitForLoadState("networkidle").catch(() => {});
    await sleep(300);
  };

  try {
    // ---------------------------------------------------------------- A school signs up
    const OWNER = { name: "Pauline Etoundi", business: "Collège Les Lauriers", email: `school-owner+${stamp}@example.com`, password: "Wazabolt2026" };
    const TEACHER = { name: "Jean Abena", email: `school-teacher+${stamp}@example.com`, password: "Wazabolt2026" };
    await page.goto(`${APP}/en/register`);
    await page.getByLabel("Your name").fill(OWNER.name);
    await page.getByLabel("Business name").fill(OWNER.business);
    await page.getByLabel("Email", { exact: true }).fill(OWNER.email);
    await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    await page.goto(linkFrom(await latestMail(OWNER.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/onboarding/);
    const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now(), free_limits_from = '2099-12-31', industry = 'school', default_language = 'en', city = 'Douala', phone = '+237 699 000 010' where id = '${biz}'`);

    await page.goto(`${APP}/en/dashboard`);
    await page.waitForURL(/\/en\/dashboard\/school$/, { timeout: 15000 });
    await settle();
    ok("a school starts on its school overview (no sales module by default)", (await main.getByRole("heading", { name: "School", exact: true }).count()) === 1);
    ok("the menu shows school pages, not the till or products", (await nav.getByRole("link", { name: "Students" }).count()) === 1 && (await nav.getByRole("link", { name: "Sales" }).count()) === 0 && (await nav.getByRole("link", { name: "Products" }).count()) === 0);
    ok("a setup checklist guides the school", (await main.getByTestId("school-setup").locator("li").count()) === 5);

    // ---------------------------------------------------------------- Settings, preset, year
    await page.goto(`${APP}/en/dashboard/school/settings`);
    await main.getByTestId("grading-presets").locator("div").filter({ hasText: "Francophone" }).getByRole("button", { name: "Use these values" }).click();
    await until(() => sql(`select count(*) from school_settings where business_id = '${biz}'`) === "1");
    await page.reload();
    await settle();
    ok("the Francophone preset fills the grading (/20, pass 10, coefficients, A–E)", sql(`select scale_max || ' ' || pass_mark || ' ' || use_coefficients || ' ' || jsonb_array_length(grade_boundaries) from school_settings where business_id = '${biz}'`) === "20.00 10.00 true 5");
    await main.getByLabel("Motto").fill("Travail · Discipline · Succès");
    await main.getByLabel("Principal's name").fill("M. Etoundi");
    await main.getByLabel("Registration / authorisation number").fill("123/MINESEC");
    await main.getByLabel("Language of report cards and fee invoices").selectOption("fr");
    await main.getByLabel("Grades").fill("16 A Très bien\n14 B Bien\n12 C Assez bien\nten D");
    await main.getByRole("button", { name: "Save", exact: true }).click();
    await main.getByText("One grade per line").first().waitFor({ timeout: 10000 });
    ok("grade boundaries are checked (a wrong line is refused)", true);
    await main.getByLabel("Grades").fill("16 A Très bien\n14 B Bien\n12 C Assez bien\n10 D Passable\n0 E Insuffisant");
    await main.getByRole("button", { name: "Save", exact: true }).click();
    await main.getByText("School settings saved.").waitFor({ timeout: 10000 });
    ok("school profile and report settings saved", sql(`select motto || '|' || report_language from school_settings where business_id = '${biz}'`) === "Travail · Discipline · Succès|fr");

    const years = main.getByTestId("school-years");
    await years.getByLabel("Year", { exact: true }).fill("2026-2027");
    await years.getByRole("button", { name: "Add the year" }).click();
    await main.getByText("Year added.").waitFor({ timeout: 10000 });
    await page.reload();
    ok(
      "the year is created current, with the preset's 3 terms and 2 sequences each (in the school's language)",
      sql(`select count(*) from school_terms t join academic_years y on y.id = t.year_id where y.business_id = '${biz}' and y.is_current`) === "3" &&
        sql(`select string_agg(a.name, ',' order by a.position) from school_assessments a join school_terms t on t.id = a.term_id where t.business_id = '${biz}' and t.position = 1`) === "Séquence 1,Séquence 2",
    );

    // ---------------------------------------------------------------- Teacher invited
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(TEACHER.email);
    await main.getByLabel("Role", { exact: true }).selectOption("teacher");
    await main.getByRole("button", { name: "Create invitation link" }).click();
    const linkBox = main.getByRole("textbox", { name: `Invitation link for ${TEACHER.email}` });
    await linkBox.waitFor({ timeout: 10000 });
    const teacherLink = await linkBox.inputValue();
    const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const tp = await tctx.newPage();
    tp.on("pageerror", (e) => errors.push(String(e)));
    tp.on("dialog", (d) => d.accept());
    const tmain = tp.locator("main");
    await tp.goto(teacherLink);
    ok("the invitation names the Teacher role", (await tp.getByText(`${OWNER.name} invited you as Teacher.`).count()) === 1);
    await tp.getByLabel("Your name").fill(TEACHER.name);
    await tp.getByLabel("Password", { exact: true }).fill(TEACHER.password);
    await tp.getByRole("button", { name: "Create account and join" }).click();
    await tp.getByText(/open the confirmation email we sent you/).waitFor({ timeout: 10000 });
    await tp.goto(linkFrom(await latestMail(TEACHER.email, "Confirm")));
    await tp.waitForURL(/\/dashboard\/school/, { timeout: 15000 });
    await settle(tp);
    const teacherId = sql(`select id from auth.users where email = '${TEACHER.email}'`);
    ok("the teacher joins as Teacher and lands on the school pages", sql(`select role from business_members where user_id = '${teacherId}'`) === "teacher" && (await tmain.getByText("No class or subject is assigned to you yet.", { exact: false }).count()) === 1);
    await tp.goto(`${APP}/en/dashboard/customers`);
    await tp.waitForURL(/\/dashboard\/school/, { timeout: 10000 });
    ok("a teacher opening business pages (customers) is sent back to the school pages", true);
    const tnav = tp.locator("aside nav").first();
    ok("the teacher's menu: school overview, classes, results — no students list, fees, documents or settings", (await tnav.getByRole("link").count()) >= 3 && (await tnav.getByRole("link", { name: "School fees" }).count()) === 0 && (await tnav.getByRole("link", { name: "Documents" }).count()) === 0 && (await tnav.getByRole("link", { name: "Settings" }).count()) === 0);

    // ---------------------------------------------------------------- Subjects, class, students
    await page.goto(`${APP}/en/dashboard/school/classes`);
    for (const s of ["Mathématiques", "Français"]) {
      await main.locator("#subjects").getByLabel("Subject").fill(s);
      await main.locator("#subjects").getByRole("button", { name: "Add the subject" }).click();
      await main.getByText("Subject added.").first().waitFor({ timeout: 10000 });
    }
    await main.getByLabel("Class name").fill("6e A");
    await main.getByLabel("Level").fill("6e");
    await main.getByLabel("Class teacher").selectOption({ label: TEACHER.name });
    await main.getByRole("button", { name: "Add the class" }).click();
    await main.getByText("Class added.").waitFor({ timeout: 10000 });
    await page.reload();
    await main.getByTestId("class-rows").getByRole("link", { name: "6e A" }).click();
    await page.waitForURL(/\/school\/classes\/[0-9a-f-]{36}/);
    const classUrl = page.url().split("?")[0];
    const classId = classUrl.split("/").pop();
    for (const [subject, coef, teacher] of [["Mathématiques", "4", TEACHER.name], ["Français", "3", OWNER.name]]) {
      const add = main.locator("form").filter({ has: page.getByRole("button", { name: "Add to the class" }) });
      await add.getByLabel("Subject").selectOption({ label: subject });
      await add.getByLabel("Coefficient").fill(coef);
      await add.getByLabel("Teacher").selectOption({ label: teacher });
      await add.getByRole("button", { name: "Add to the class" }).click();
      await until(async () => (await main.getByTestId("class-subjects").locator("tr").filter({ hasText: subject }).count()) === 1);
    }
    ok("subjects added to the class with coefficients and teachers", sql(`select string_agg(s.name || ':' || cs.coefficient, ',' order by cs.position) from class_subjects cs join school_subjects s on s.id = cs.subject_id where cs.class_id = '${classId}'`) === "Mathématiques:4.00,Français:3.00");

    const STUDENTS = [
      ["Bello", "Amina", "female", "670500001"],
      ["Kamga", "Brice", "male", ""],
      ["Ndi", "Carl", "male", ""],
    ];
    for (const [last, first, gender, phone] of STUDENTS) {
      await page.goto(`${APP}/en/dashboard/school/students/new`);
      await main.getByLabel("Last name").fill(last);
      await main.getByLabel("First name(s)").fill(first);
      await main.getByLabel("Gender").selectOption(gender);
      await main.getByLabel("Class", { exact: true }).selectOption({ label: "6e A" });
      if (phone) {
        await main.getByLabel("Parent / guardian's name").fill("Mme Bello");
        await main.getByLabel("Parent / guardian's WhatsApp number").fill(phone);
      }
      await main.getByRole("button", { name: "Register the student" }).click();
      await page.waitForURL(/\/school\/students\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    }
    const amina = sql(`select id from school_students where business_id = '${biz}' and last_name = 'Bello'`);
    ok("students get numbers STU-000001… and join the class", sql(`select string_agg(student_number, ',' order by student_number) from school_students where business_id = '${biz}'`) === "STU-000001,STU-000002,STU-000003" && sql(`select count(*) from school_enrollments where class_id = '${classId}'`) === "3");
    ok("the parent's WhatsApp number becomes a customer linked to the student", sql(`select c.whatsapp_phone || ' ' || c.name from school_students s join customers c on c.id = s.guardian_customer_id where s.id = '${amina}'`) === "237670500001 Mme Bello");

    // ---------------------------------------------------------------- Teacher enters marks
    await tp.goto(`${APP}/en/dashboard/school`);
    await settle(tp);
    ok("the teacher sees their subject and class", (await tmain.getByTestId("teacher-subjects").getByText("Mathématiques").count()) === 1);
    await tmain.getByRole("link", { name: "Enter marks" }).click();
    await tp.waitForURL(/\/marks\?subject=/);
    await settle(tp);
    const grid = tmain.getByTestId("marks-grid");
    const cell = (name, a) => grid.getByLabel(`${name} — ${a}`, { exact: true });
    await cell("BELLO Amina", "Séquence 1").fill("15");
    await cell("BELLO Amina", "Séquence 2").fill("12");
    await cell("KAMGA Brice", "Séquence 1").fill("8");
    await grid.getByLabel("KAMGA Brice — Séquence 2 — Abs").check();
    await cell("NDI Carl", "Séquence 1").fill("25");
    ok("a mark above the maximum is flagged and can't be saved", (await tmain.getByText("A mark is above the maximum or below 0.").count()) === 1 && (await tmain.getByTestId("save-marks").isDisabled()));
    await cell("NDI Carl", "Séquence 1").fill("15");
    await cell("NDI Carl", "Séquence 2").fill("12");
    await grid.getByLabel("BELLO Amina — Comment").fill("Bon travail");
    ok("the subject average shows as marks are typed (13.50 for 15 and 12; 8.00 with an absence)", (await grid.getByTestId("row-average").first().innerText()) === "13.50" && (await grid.getByTestId("row-average").nth(1).innerText()) === "8.00");
    await tmain.getByTestId("save-marks").click();
    await tmain.getByText("Marks saved.").waitFor({ timeout: 10000 });
    ok("the teacher's marks are saved (with the absence and the comment)", sql(`select count(*) from school_marks m join class_subjects cs on cs.id = m.class_subject_id where cs.class_id = '${classId}'`) === "6" && sql(`select count(*) from school_marks where student_id = (select id from school_students where last_name = 'Kamga' and business_id = '${biz}') and absent`) === "1" && sql(`select comment from school_subject_comments where student_id = '${amina}'`) === "Bon travail");

    // Not their subject: read-only.
    const frenchId = sql(`select cs.id from class_subjects cs join school_subjects s on s.id = cs.subject_id where cs.class_id = '${classId}' and s.name = 'Français'`);
    const termId = sql(`select t.id from school_terms t join academic_years y on y.id = t.year_id where y.business_id = '${biz}' and t.position = 1`);
    await tp.goto(`${APP}/en/dashboard/school/classes/${classId}/marks?subject=${frenchId}&term=${termId}`);
    await settle(tp);
    ok("another teacher's subject is read-only for them", (await tmain.getByText("only the subject's teacher or an admin can change them", { exact: false }).count()) === 1 && (await tmain.getByTestId("save-marks").count()) === 0);

    // Owner enters French.
    await page.goto(`${APP}/en/dashboard/school/classes/${classId}/marks?subject=${frenchId}&term=${termId}`);
    await settle();
    const ogrid = main.getByTestId("marks-grid");
    for (const [n, a, b] of [["BELLO Amina", "14", "14"], ["KAMGA Brice", "9", "10"], ["NDI Carl", "14", "14"]]) {
      await ogrid.getByLabel(`${n} — Séquence 1`, { exact: true }).fill(a);
      await ogrid.getByLabel(`${n} — Séquence 2`, { exact: true }).fill(b);
    }
    await main.getByTestId("save-marks").click();
    await main.getByText("Marks saved.").waitFor({ timeout: 10000 });

    // ---------------------------------------------------------------- Results, comments, publishing
    const resultsUrl = `${APP}/en/dashboard/school/results?class=${classId}&term=${termId}`;
    await tp.goto(resultsUrl);
    await settle(tp);
    const tc = tmain.getByTestId("result-rows").locator("tr").filter({ hasText: "BELLO Amina" });
    await tc.locator("summary").click();
    await tc.getByLabel("Class teacher").fill("Élève sérieuse et appliquée");
    await tc.getByRole("button", { name: "Save" }).click();
    await until(() => sql(`select class_teacher_comment from school_term_comments where student_id = '${amina}'`) === "Élève sérieuse et appliquée");
    ok("the class teacher writes the class teacher's comment (not the principal's), and can't publish", (await tc.getByLabel("Principal").count()) === 0 && (await tmain.getByRole("button", { name: "Publish results" }).count()) === 0);

    await page.goto(resultsUrl);
    await settle();
    ok("results are provisional until published", (await main.getByText("Not published: computed from the current marks.", { exact: false }).count()) === 1);
    const rows = main.getByTestId("result-rows").locator("tr");
    // Amina and Carl: (13.5×4 + 14×3)/7 = 13.71, tied 1st; Brice: (8×4 + 9.5×3)/7 = 8.64, 3rd.
    ok(
      "averages with coefficients, grades and positions with ties",
      (await rows.nth(0).innerText()).includes("13.71") && (await rows.nth(1).innerText()).includes("13.71") && (await rows.nth(2).innerText()).startsWith("3") && (await rows.nth(2).innerText()).includes("8.64"),
      (await main.getByTestId("result-rows").innerText()).replace(/\s+/g, " ").slice(0, 300),
    );
    const orow = main.getByTestId("result-rows").locator("tr").filter({ hasText: "BELLO Amina" });
    await orow.locator("summary").click();
    await orow.getByLabel("Principal").fill("Félicitations");
    await orow.locator("form").filter({ has: page.getByLabel("Principal") }).getByRole("button", { name: "Save" }).click();
    await until(() => sql(`select principal_comment from school_term_comments where student_id = '${amina}'`) === "Félicitations");
    const [pdl] = await Promise.all([page.waitForEvent("download"), main.getByTestId("report-cards-pdf").click()]);
    const ppdf = readFileSync(await pdl.path());
    writeFileSync("test-results/school-report-cards-provisional.pdf", ppdf);
    ok("provisional report cards: one page per student, French file name", pages(ppdf) === 3 && pdl.suggestedFilename() === "bulletin-6e-a-trimestre-1.pdf", pdl.suggestedFilename());

    await main.getByRole("button", { name: "Publish results" }).click();
    await main.getByText(/^Published /).waitFor({ timeout: 15000 });
    ok("results published: frozen snapshot saved", sql(`select count(*) from school_result_publications where class_id = '${classId}' and withdrawn_at is null and jsonb_array_length(results->'students') = 3`) === "1");
    await tp.goto(`${APP}/en/dashboard/school/classes/${classId}/marks?subject=${sql(`select cs.id from class_subjects cs join school_subjects s on s.id = cs.subject_id where cs.class_id = '${classId}' and s.name = 'Mathématiques'`)}&term=${termId}`);
    await settle(tp);
    ok("after publishing, the teacher's marks are locked", (await tmain.getByText("Results for this term are published", { exact: false }).count()) === 1 && (await tmain.getByTestId("save-marks").count()) === 0);
    await page.reload();
    await settle();
    const [odl] = await Promise.all([page.waitForEvent("download"), main.getByTestId("result-rows").locator("tr").filter({ hasText: "BELLO Amina" }).getByRole("link", { name: "PDF" }).click()]);
    const opdf = readFileSync(await odl.path());
    writeFileSync("test-results/school-report-card-amina.pdf", opdf);
    ok("a published report card for one student (one page)", pages(opdf) === 1 && odl.suggestedFilename() === "bulletin-stu-000001-trimestre-1.pdf", odl.suggestedFilename());
    await main.getByTestId("result-rows").locator("tr").filter({ hasText: "BELLO Amina" }).getByTestId("send-whatsapp").click();
    await main.getByText("WhatsApp isn't connected. Connect your number first.").waitFor({ timeout: 15000 });
    ok("sending to the parent is refused while WhatsApp isn't connected (nothing faked)", sql(`select count(*) from messages where business_id = '${biz}'`) === "0");
    ok("students without a parent number say so", (await main.getByTestId("result-rows").getByText("No parent number").count()) === 2);

    await main.getByLabel("Reason").fill("Erreur en mathématiques");
    await main.getByRole("button", { name: "Withdraw" }).click();
    // The withdraw panel goes away with the publication: wait for the database.
    await until(() => sql(`select count(*) from school_result_publications where class_id = '${classId}' and withdrawn_at is not null`) === "1");
    ok("withdrawing (with a reason) unlocks the marks; the publication stays in history", sql(`select count(*) from school_result_publications where class_id = '${classId}' and withdrawn_at is not null`) === "1" && sql(`select count(*) from audit_logs where business_id = '${biz}' and action = 'school.results_withdrawn'`) === "1");

    // ---------------------------------------------------------------- Fees
    await page.goto(`${APP}/en/dashboard/school/fees`);
    await main.getByLabel("Fee", { exact: true }).fill("Scolarité T1");
    await main.getByLabel(/^Amount/).fill("25000");
    await main.getByLabel("Class", { exact: true }).selectOption({ label: "6e A" });
    await main.getByRole("button", { name: "Add the fee" }).click();
    await main.getByText("Fee added.").waitFor({ timeout: 10000 });
    await page.reload();
    await main.getByTestId("fee-rows").getByRole("button", { name: "Bill students" }).click();
    await until(() => sql(`select count(*) from documents where business_id = '${biz}' and fee_item_id is not null`) === "3");
    await page.reload();
    await settle();
    ok("billing a fee issues one invoice per student, in the school's language, to the parent", sql(`select count(*) from documents where business_id = '${biz}' and fee_item_id is not null and status = 'issued' and language = 'fr'`) === "3" && sql(`select customer_id is not null from documents where student_id = '${amina}'`) === "t");
    ok("fee table and balances by student", (await main.getByTestId("fee-rows").innerText()).includes("75,000") && (await main.getByTestId("balance-rows").locator("tr").count()) === 3);
    await main.getByTestId("fee-rows").getByRole("button", { name: "Bill students" }).click();
    await sleep(1500);
    ok("billing again doesn't bill twice", sql(`select count(*) from documents where business_id = '${biz}' and fee_item_id is not null`) === "3");
    const feeInvoice = sql(`select id from documents where student_id = '${amina}' and doc_type = 'invoice'`);
    await page.goto(`${APP}/en/dashboard/documents/${feeInvoice}`);
    const rec = main.getByTestId("record-invoice-payment");
    await rec.getByLabel(/Amount received/).fill("10000");
    await rec.getByLabel("Paid by").selectOption("mtn_momo");
    await rec.getByRole("button", { name: "Record payment" }).click();
    await main.getByText("Payment recorded.").waitFor({ timeout: 10000 });
    await page.goto(`${APP}/en/dashboard/school/students/${amina}`);
    await settle();
    ok("the student's profile shows the fee, what was paid and the balance", (await main.getByTestId("student-fees-summary").innerText()).includes("15,000") && (await main.getByTestId("student-fees").locator("li").count()) === 1);

    // Teachers don't see fees.
    await tp.goto(`${APP}/en/dashboard/school/fees`);
    await settle(tp);
    ok("teachers see no fees or balances", (await tmain.getByTestId("fee-rows").count()) === 0 && (await tmain.getByTestId("balance-rows").count()) === 0);

    // ---------------------------------------------------------------- Modules
    await page.goto(`${APP}/en/dashboard/settings`);
    await main.getByTestId("modules").locator("li").filter({ hasText: "Sales and stock" }).getByRole("button", { name: "Turn on" }).click();
    await until(async () => (await nav.getByRole("link", { name: "Sales" }).count()) === 1);
    ok("an owner turns on Sales and stock: the menu shows it", (await nav.getByRole("link", { name: "Sales" }).count()) === 1);
    await main.getByTestId("modules").locator("li").filter({ hasText: "Sales and stock" }).getByRole("button", { name: "Turn off" }).click();
    await until(async () => (await nav.getByRole("link", { name: "Sales" }).count()) === 0);
    ok("…and off again (nothing deleted)", (await nav.getByRole("link", { name: "Sales" }).count()) === 0);

    // ---------------------------------------------------------------- French, phones
    await page.goto(`${APP}/fr/dashboard/school`);
    await settle();
    ok("school overview in French", (await main.getByRole("heading", { name: "École", exact: true }).count()) === 1 && (await nav.getByRole("link", { name: "Élèves" }).count()) === 1);
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const m = await phone.newPage();
    for (const p of [`/en/dashboard/school`, `/en/dashboard/school/results?class=${classId}&term=${termId}`, `/en/dashboard/school/students/${amina}`, `/en/dashboard/school/fees`, `/en/dashboard/school/classes/${classId}`]) {
      await m.goto(`${APP}${p}`);
      await sleep(500);
      ok(`fits a 390 px phone: ${p.split("?")[0].split("/").slice(3, 5).join("/")}`, (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    }
    await m.goto(`${APP}/en/dashboard/school/classes/${classId}/marks?subject=${frenchId}&term=${termId}`);
    await sleep(500);
    ok("fits a 390 px phone: marks (the grid scrolls inside its box)", (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    await m.screenshot({ path: "test-results/school-marks-mobile.png", fullPage: true });
    await phone.close();
    await page.goto(resultsUrl.replace("/en/", "/en/"));
    await settle();
    await page.screenshot({ path: "test-results/school-results.png", fullPage: true });
    await tctx.close();

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
    await page.screenshot({ path: "test-results/school-failure.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
