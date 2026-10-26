/*
 * End-to-end test of the Docs and School plan entitlements: a new Free school
 * (limits in force from day one) with 20 saved documents, 50 active students,
 * free teacher accounts beside the one Free user, report cards one student at
 * a time, no advanced school reports — refused on the server with clear
 * messages and upgrade notices — then the same school on Business: bulk report
 * cards, school reports and CSV. Billing shows the usage. Against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:school-limits
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sqlError = (q) => {
  try {
    sql(q);
    return "";
  } catch (e) {
    return String(e.stderr ?? e);
  }
};
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
  const settle = async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    await sleep(300);
  };
  const open = async (path) => {
    await page.goto(`${APP}${path}`);
    await settle();
  };

  try {
    // ---------------------------------------------------------------- A new Free school (limits apply now)
    const OWNER = { name: "Marie Ngo", business: "École Les Palmiers", email: `limits-owner+${stamp}@example.com`, password: "Wazabolt2026" };
    await page.goto(`${APP}/en/register`);
    await page.getByLabel("Your name").fill(OWNER.name);
    await page.getByLabel("Business name").fill(OWNER.business);
    await page.getByTestId("business-type").getByText("Shop", { exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(OWNER.email);
    await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    await page.goto(linkFrom(await latestMail(OWNER.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/onboarding/);
    const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    const owner = sql(`select id from auth.users where email = '${OWNER.email}'`);
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now(), industry = 'school', default_language = 'en' where id = '${biz}'`);
    sql(`insert into business_modules (business_id, module, enabled) values ('${biz}', 'school', true), ('${biz}', 'docs', true) on conflict (business_id, module) do update set enabled = true`);
    ok("a new business is on Free with the limits in force today", sql(`select s.plan_id || '|' || (b.free_limits_from <= current_date) from subscriptions s join businesses b on b.id = s.business_id where b.id = '${biz}'`) === "free|true");

    // School setup (year, term, class, subject) and 49 students, through SQL.
    sql(`insert into school_settings (business_id, grading_preset, scale_max, pass_mark, student_prefix) values ('${biz}', 'francophone_20', 20, 10, 'ELV')`);
    const year = sql(`insert into academic_years (business_id, name, is_current) values ('${biz}', '2026-2027', true) returning id`);
    const term = sql(`insert into school_terms (business_id, year_id, name, position) values ('${biz}', '${year}', 'Term 1', 1) returning id`);
    sql(`insert into school_assessments (business_id, term_id, name, weight, max_mark, position) values ('${biz}', '${term}', 'Test 1', 100, 20, 1)`);
    const klass = sql(`insert into school_classes (business_id, year_id, name) values ('${biz}', '${year}', 'CM2 A') returning id`);
    const subject = sql(`insert into school_subjects (business_id, name) values ('${biz}', 'Mathematics') returning id`);
    const cs = sql(`insert into class_subjects (business_id, class_id, subject_id, coefficient) values ('${biz}', '${klass}', '${subject}', 2) returning id`);
    sql(`insert into school_students (business_id, first_name, last_name) select '${biz}', 'Student', 'N' || lpad(i::text, 2, '0') from generate_series(1, 49) i`);
    sql(`insert into school_enrollments (business_id, student_id, class_id) select '${biz}', id, '${klass}' from school_students where business_id = '${biz}' and last_name in ('N01', 'N02')`);
    const assess = sql(`select id from school_assessments where term_id = '${term}'`);
    sql(`insert into school_marks (business_id, class_subject_id, assessment_id, student_id, mark, entered_by) select '${biz}', '${cs}', '${assess}', id, case last_name when 'N01' then 15 else 8 end, '${owner}' from school_students where business_id = '${biz}' and last_name in ('N01', 'N02')`);
    const n01 = sql(`select id from school_students where business_id = '${biz}' and last_name = 'N01'`);

    // ---------------------------------------------------------------- Students: 50 on Free
    await open(`/en/dashboard/school`);
    ok("the school overview shows students, teacher seats and report cards for the term", (await main.getByTestId("school-usage").innerText()).replace(/\s+/g, " ").includes("49 of 50") && (await main.getByTestId("school-usage").innerText()).includes("0 of 30") && (await main.getByTestId("school-usage").innerText()).includes("Report cards · Term 1"));
    await open(`/en/dashboard/school/students`);
    ok("the students list shows 49 of 50", (await main.getByTestId("students-usage").innerText()).includes("49 of 50"));
    await open(`/en/dashboard/school/students/new`);
    await main.getByLabel("Last name").fill("Fifty");
    await main.getByLabel("First name(s)").fill("Number");
    await main.getByRole("button", { name: "Register the student" }).click();
    await page.waitForURL(/\/school\/students\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    ok("the 50th student is registered", sql(`select count(*) from school_students where business_id = '${biz}' and status = 'active'`) === "50");
    await open(`/en/dashboard/school/students`);
    ok("at 50: an upgrade notice instead of the Add button", (await main.getByTestId("plan-upsell").innerText()).includes("50 active students") && (await main.getByTestId("new-student").count()) === 0);
    // Someone else adds a student while the form is open: the server refuses.
    sql(`update school_students set status = 'withdrawn' where business_id = '${biz}' and last_name = 'N49'`);
    await open(`/en/dashboard/school/students/new`);
    await main.getByLabel("Last name").fill("Late");
    await main.getByLabel("First name(s)").fill("Comer");
    sql(`update school_students set status = 'active' where business_id = '${biz}' and last_name = 'N49'`);
    await main.getByRole("button", { name: "Register the student" }).click();
    await main.getByText("Your plan's student limit is reached", { exact: false }).waitFor({ timeout: 10000 }).catch(() => {});
    ok("the 51st student is refused on the server with a clear message", (await main.getByText("Your plan's student limit is reached", { exact: false }).count()) === 1 && sql(`select count(*) from school_students where business_id = '${biz}' and last_name = 'Late'`) === "0");
    ok("the database refuses a 51st student however it's added", sqlError(`insert into school_students (business_id, first_name, last_name) values ('${biz}', 'X', 'Y')`).includes("plan limit"));

    // ---------------------------------------------------------------- Teachers beside the one Free user
    await open(`/en/dashboard/team`);
    ok("the team page shows users and teacher seats separately", (await main.getByTestId("team-seats").innerText()).replace(/\s+/g, " ").includes("1 of 1") && (await main.getByTestId("team-seats").innerText()).includes("0 of 30"));
    await main.getByLabel("Their email address").fill(`limits-teacher+${stamp}@example.com`);
    await main.getByLabel("Role", { exact: true }).selectOption("teacher");
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByRole("textbox", { name: `Invitation link for limits-teacher+${stamp}@example.com` }).waitFor({ timeout: 10000 });
    ok("a Free school invites a teacher although its one user is taken", sql(`select count(*) from business_invitations where business_id = '${biz}' and role = 'teacher'`) === "1");
    await open(`/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`limits-agent+${stamp}@example.com`);
    await main.getByLabel("Role", { exact: true }).selectOption("agent");
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByText("Your plan's user limit is reached", { exact: false }).waitFor({ timeout: 10000 }).catch(() => {});
    ok("but a second user (agent) is refused", (await main.getByText("Your plan's user limit is reached", { exact: false }).count()) === 1 && sql(`select count(*) from business_invitations where business_id = '${biz}' and role = 'agent'`) === "0");
    await open(`/en/dashboard/team`);
    ok("the pending teacher invitation holds a seat (1 of 30)", (await main.getByTestId("team-seats").innerText()).includes("1 of 30"));

    // ---------------------------------------------------------------- Report cards: one at a time on Free
    const results = `/en/dashboard/school/results?class=${klass}&term=${term}`;
    await open(results);
    ok("Free: no whole-class PDF or print button, an upgrade notice instead", (await main.getByTestId("report-cards-pdf").count()) === 0 && (await main.getByTestId("plan-upsell").innerText()).includes("Boutique"));
    ok("Free: report card usage for the term is shown", (await main.getByTestId("report-card-usage").innerText()).includes("0 of 50"));
    const one = await page.request.get(`${APP}/en/dashboard/school/results/pdf?class=${klass}&term=${term}&student=${n01}`);
    ok("Free: one student's report card still downloads", one.status() === 200 && one.headers()["content-type"] === "application/pdf");
    const all = await page.request.get(`${APP}/en/dashboard/school/results/pdf?class=${klass}&term=${term}`);
    ok("Free: the server refuses a whole-class PDF", all.status() === 403);
    await main.getByRole("button", { name: "Publish results" }).click();
    await main.getByText("Published", { exact: false }).first().waitFor({ timeout: 15000 });
    await until(() => sql(`select count(*) from school_result_publications where term_id = '${term}' and withdrawn_at is null`) === "1");
    await open(results);
    ok("…and the usage reads 2 of 50", (await main.getByTestId("report-card-usage").innerText()).includes("2 of 50"));
    await page.request.get(`${APP}/en/dashboard/school/results/pdf?class=${klass}&term=${term}&student=${n01}`);
    await open(results);
    ok("downloading the same published report card again doesn't count again", (await main.getByTestId("report-card-usage").innerText()).includes("2 of 50"));

    // ---------------------------------------------------------------- Advanced school reports: Business and Pro
    ok("the School reports menu item is there for owners", (await nav.getByRole("link", { name: "School reports" }).count()) === 1);
    await open(`/en/dashboard/school/reports`);
    ok("Free: school reports show what's included and from which plan", (await main.getByTestId("plan-upsell").innerText()).includes("Business") && (await main.getByTestId("school-report-classes").count()) === 0);
    const csvFree = await page.request.get(`${APP}/en/dashboard/school/reports/export?term=${term}&kind=classes`);
    ok("Free: the CSV export is refused on the server", csvFree.status() === 403);

    // ---------------------------------------------------------------- Saved documents: 20 on Free
    sql(
      `insert into documents (business_id, doc_type, issue_date, business_snapshot, customer_snapshot, items, subtotal, total, created_by) select '${biz}', 'invoice', current_date, '{"name":"École Les Palmiers"}', '{"name":"Parent"}', '[{"description":"Cours","quantity":1,"unitPrice":1000}]', 1000, 1000, '${owner}' from generate_series(1, 19)`,
    );
    await open(`/en/dashboard/documents`);
    ok("the documents list shows 19 of 20 saved documents", (await main.getByTestId("documents-usage").innerText()).includes("19 of 20"));
    await open(`/en/dashboard/documents/new?type=invoice`);
    await main.getByLabel("Customer name").fill("Parent Late");
    await main.getByLabel("Description").first().fill("Lessons");
    await main.getByLabel("Unit price").first().fill("5000");
    // The 20th is saved elsewhere meanwhile: this one is refused on the server.
    sql(
      `insert into documents (business_id, doc_type, issue_date, business_snapshot, customer_snapshot, items, subtotal, total, created_by) values ('${biz}', 'invoice', current_date, '{"name":"École Les Palmiers"}', '{"name":"Parent"}', '[{"description":"Cours","quantity":1,"unitPrice":1000}]', 1000, 1000, '${owner}')`,
    );
    await main.getByTestId("doc-issue").click();
    await main.getByText("saved-document limit", { exact: false }).waitFor({ timeout: 10000 }).catch(() => {});
    ok("the 21st document is refused with an upgrade message", (await main.getByText("saved-document limit", { exact: false }).count()) >= 1 && sql(`select count(*) from documents where business_id = '${biz}'`) === "20");
    await open(`/en/dashboard/documents`);
    ok("at 20: an upgrade notice, no New buttons", (await main.getByTestId("plan-upsell").innerText()).includes("20 saved documents") && (await main.getByRole("link", { name: "New invoice" }).count()) === 0);
    await open(`/en/dashboard/documents/new?type=quotation`);
    ok("…and the editor isn't offered", (await main.getByTestId("doc-issue").count()) === 0 && (await main.getByTestId("plan-upsell").count()) === 1);
    // Fee invoices don't count.
    const fee = sql(`insert into school_fee_items (business_id, year_id, class_id, name, amount) values ('${biz}', '${year}', '${klass}', 'Tuition T1', 25000) returning id`);
    await open(`/en/dashboard/school/fees`);
    await main.getByTestId("fee-rows").getByRole("button", { name: "Bill students" }).click();
    const billed = await until(() => sql(`select count(*) from documents where fee_item_id = '${fee}'`) === "2");
    ok("school fee invoices are billed at the document limit (school allowance)", billed && sql(`select count(*) from documents where business_id = '${biz}' and fee_item_id is null`) === "20", sql(`select count(*) from documents where fee_item_id = '${fee}'`));

    // ---------------------------------------------------------------- Billing shows it all
    await open(`/en/dashboard/billing`);
    const usage = (await main.getByTestId("plan-usage").innerText()).replace(/\s+/g, " ");
    ok("billing shows saved documents, students and teacher accounts", usage.includes("Saved documents") && usage.includes("20 of 20") && usage.includes("Active students") && usage.includes("50 of 50") && usage.includes("Teacher accounts") && usage.includes("1 of 30"), usage);
    ok("billing's plan cards list the new entitlements", (await main.getByText("20 saved invoices, receipts and quotations").count()) >= 1 && (await main.getByText("Advanced school reports").count()) >= 1);

    // The grace notice (a Free business whose limits start later) names the school limits too.
    sql(`update businesses set free_limits_from = '2026-12-01' where id = '${biz}'`);
    await open(`/en/dashboard/billing`);
    const grace = (await page.getByTestId("plan-grace-notice").innerText()).replace(/\s+/g, " ");
    ok("grace notice: saved documents and the school's students and report cards", grace.includes("20 saved documents") && grace.includes("For your school: up to 50 active students and report cards for 50 students"), grace);
    sql(`update businesses set free_limits_from = current_date where id = '${biz}'`);

    // ---------------------------------------------------------------- Fair use (WazaBolt team): the school on Pro
    sql(`update subscriptions set plan_id = 'pro' where business_id = '${biz}'`);
    sql(`insert into platform_admins (user_id) values ('${owner}')`);
    await open(`/en/admin/fair-use`);
    const fair = page.locator(`tr[data-business-id="${biz}"]`);
    const fairText = (await fair.count()) ? (await fair.innerText()).replace(/\s+/g, " ") : "";
    ok("fair use: a Pro school with its active students, classes, teachers and documents (50 students: not flagged)", /pro/.test(fairText) && /\b50\b/.test(fairText) && /Normal/.test(fairText), fairText);
    sql(`insert into school_students (business_id, first_name, last_name, status) select '${biz}', 'Extra', 'Student ' || g, 'active' from generate_series(1, 451) g`);
    await page.reload();
    ok("fair use: above 500 active students it is flagged for review", /Above business/.test(await fair.innerText()));
    sql(`delete from school_students where business_id = '${biz}' and first_name = 'Extra'`);
    sql(`delete from platform_admins where user_id = '${owner}'`);

    // ---------------------------------------------------------------- The same school on Business
    sql(`update subscriptions set plan_id = 'business' where business_id = '${biz}'`);
    await open(results);
    ok("Business: whole-class report cards are offered", (await main.getByTestId("report-cards-pdf").count()) === 1 && (await main.getByTestId("report-card-usage").innerText()).includes("2 of 500"));
    const bulk = await page.request.get(`${APP}/en/dashboard/school/results/pdf?class=${klass}&term=${term}`);
    ok("Business: the whole-class PDF downloads", bulk.status() === 200 && bulk.headers()["content-type"] === "application/pdf");
    await open(`/en/dashboard/school/reports`);
    const classes = await main.getByTestId("school-report-classes").innerText();
    ok("Business: school reports show the class's results and fee collection", classes.includes("CM2 A") && classes.includes("Published") && classes.includes("50,000") && classes.includes("Whole school"), classes.replace(/\s+/g, " "));
    ok("Business: subject results per class", (await main.getByTestId("school-report-subjects").innerText()).includes("Mathematics"));
    const csv = await page.request.get(`${APP}/en/dashboard/school/reports/export?term=${term}&kind=classes`);
    const body = await csv.text();
    ok("Business: the CSV downloads with the class row and the totals", csv.status() === 200 && body.includes("CM2 A") && body.includes("Whole school") && body.includes("Pass rate (%)"));
    const subjCsv = await (await page.request.get(`${APP}/en/dashboard/school/reports/export?term=${term}&kind=subjects`)).text();
    ok("Business: the subjects CSV too", subjCsv.includes("Mathematics"));
    await open(`/en/dashboard/documents`);
    ok("Business: no document limit", (await main.getByTestId("documents-usage").count()) === 0 && (await main.getByTestId("plan-upsell").count()) === 0 && (await main.getByRole("link", { name: "New invoice" }).count()) === 1);
    await open(`/en/dashboard/school/students`);
    ok("Business: students can be added again (50 of 500)", (await main.getByTestId("students-usage").innerText()).includes("50 of 500") && (await main.getByTestId("new-student").count()) === 1);
    ok("no plan or price changed by the app", sql(`select plan_id from subscriptions where business_id = '${biz}'`) === "business" && sql(`select monthly_price::int from plans where id = 'business'`) === "25000");

    await open(`/fr/dashboard/school/reports`);
    ok("school reports in French", (await main.getByRole("heading", { name: "Rapports scolaires", exact: true }).count()) === 1);
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const m = await phone.newPage();
    for (const p of [`/en/dashboard/school/reports`, `/en/dashboard/school`, `/en/dashboard/billing`]) {
      await m.goto(`${APP}${p}`);
      await sleep(500);
      ok(`fits a 390 px phone: ${p}`, (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    }
    await phone.close();
    await open(`/en/dashboard/school/reports`);
    await page.screenshot({ path: "test-results/school-reports.png", fullPage: true });

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
    await page.screenshot({ path: "test-results/school-limits-failure.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();

async function until(fn, ms = 10000) {
  for (let i = 0; i < ms / 250; i++) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
}
