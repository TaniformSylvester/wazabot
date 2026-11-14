/*
 * End-to-end test of the business type chosen at sign-up: a school coming
 * from the schools page (pre-selected), confirmed by email, lands in a setup
 * made for schools and then on the School overview; a restaurant chosen on
 * the form gets its menu and tables steps and adds a table during setup; the
 * marketing page links pass the type along. Against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:signup
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "./playwright.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const DB = process.env.DATABASE_URL;
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !DB) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY and DATABASE_URL");

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
const industryOf = (email) => sql(`select coalesce(b.industry, '-') from businesses b join business_members m on m.business_id = b.id join auth.users u on u.id = m.user_id where u.email = '${email}'`);

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (locale = "en-US") => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    return page;
  };

  try {
    // ---------------------------------------------------------------- The marketing pages pass the vertical along
    const page = await newPage();
    await page.goto(`${APP}/en`);
    const startHref = async (k) => page.getByTestId(`showcase-start-${k}`).getAttribute("href");
    ok(
      "home: each showcase tab's Start button signs up with its vertical (shop, restaurant, school)",
      (await startHref("shops")) === "/en/register?vertical=shop" && (await startHref("restaurants")) === "/en/register?vertical=restaurant" && (await startHref("schools")) === "/en/register?vertical=school",
    );
    await page.goto(`${APP}/en/schools`);
    ok("the schools page's Start free goes to sign-up as a school", (await page.locator('main a[href="/en/register?vertical=school"]').count()) >= 1);

    // ---------------------------------------------------------------- A school, from the home page's Schools tab
    const S = { name: "Marie Ngo", business: "Collège La Réussite", email: `signup-school+${stamp}@example.com`, password: "Wazabolt2026" };
    await page.goto(`${APP}/en`);
    await page.getByRole("tab", { name: "Schools" }).click();
    await page.getByTestId("showcase-start-schools").click();
    await page.waitForURL(/\/en\/register\?vertical=school/, { timeout: 15000 });
    ok("sign-up: the account only, saying the business type (School) carried from the tab", (await page.getByTestId("signup-vertical").getAttribute("data-vertical")) === "school" && (await page.getByLabel("School name").count()) === 0 && (await page.getByLabel("Business name").count()) === 0);
    await page.getByLabel("Your name").fill(S.name);
    await page.getByLabel("Email", { exact: true }).fill(S.email);
    await page.getByLabel("Password", { exact: true }).fill(S.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    ok("before the email is confirmed: no business, the vertical kept on the account", industryOf(S.email) === "" && sql(`select raw_user_meta_data ->> 'vertical' from auth.users where email = '${S.email}'`) === "school");
    const schoolLink = linkFrom(await latestMail(S.email, "Confirm"));
    await page.goto(schoolLink);
    await page.waitForURL(/\/en\/dashboard\/setup\?vertical=school/, { timeout: 15000 }).catch(() => {});
    ok("confirming the email opens the setup screen with the vertical (from the account, whatever the email links to)", /\/en\/dashboard\/setup\?vertical=school$/.test(page.url()), page.url());
    ok("setup: School pre-selected, the name field asks for the School name, FCFA by default", (await page.locator('input[name="type"][value="school"]').isChecked()) && (await page.getByLabel("School name").count()) === 1 && (await page.getByTestId("setup-currency").inputValue()) === "CM");
    // The vertical survives another sign-in: a new browser, a plain login, and the setup still has School chosen.
    const again = await newPage();
    await again.goto(`${APP}/en/login`);
    await again.getByLabel("Email", { exact: true }).fill(S.email);
    await again.getByLabel("Password", { exact: true }).fill(S.password);
    await again.getByRole("button", { name: "Log in" }).click();
    await again.waitForURL(/\/en\/dashboard\/setup/, { timeout: 15000 });
    ok("signing in again before the setup: back on the setup screen, School still chosen", await again.locator('input[name="type"][value="school"]').isChecked(), again.url());
    await again.context().close();
    await page.getByLabel("School name").fill(S.business);
    await page.getByRole("button", { name: "Create my workspace" }).click();
    await page.waitForURL(/\/en\/dashboard\/school/, { timeout: 15000 });
    ok("creating the workspace opens the school's dashboard straight away", /\/en\/dashboard\/school/.test(page.url()), page.url());
    ok("the business: a school, in FCFA, on its 14-day trial", industryOf(S.email) === "school" && sql(`select b.currency || ' ' || s.status from businesses b join business_members m on m.business_id = b.id join auth.users u on u.id = m.user_id join subscriptions s on s.business_id = b.id where u.email = '${S.email}'`) === "XAF trialing");
    // Opening the setup again (back button, second tab) doesn't make a second business.
    await page.goto(`${APP}/en/dashboard/setup?vertical=school`);
    ok("the setup screen, once done, goes back to the dashboard (one business)", !/\/setup/.test(page.url()) && sql(`select count(*) from business_members m join auth.users u on u.id = m.user_id where u.email = '${S.email}'`) === "1", page.url());
    // The guided setup is still there, one click away.
    await page.goto(`${APP}/en/dashboard/onboarding?step=1`);
    await page.getByTestId("onboarding-steps").waitFor({ timeout: 15000 });
    const flow = await page.getByTestId("onboarding-steps").getAttribute("data-flow");
    ok("the setup is the school one: profile, school, FAQs, AI, WhatsApp (no products)", flow === "profile,school,faqs,ai,whatsapp", flow);
    ok("…step 1 of 5, with School already chosen", (await page.getByText("Step 1 of 5").count()) === 1 && (await page.locator('main select[name="industry"]').inputValue()) === "school");
    ok("the setup speaks of the school: \"Set up your school\", \"School information\", School name and School email (not business)", (await page.getByRole("heading", { level: 1, name: "Set up your school" }).count()) === 1 && (await page.getByText("School information").count()) >= 1 && (await page.getByText("Tell parents — and your assistant — about your school.").count()) === 1 && (await page.locator("main").getByLabel("School name").inputValue()) === S.business && (await page.locator("main").getByLabel("School email").count()) === 1 && (await page.getByText("Business information").count()) === 0 && (await page.locator("main").getByLabel("Business name").count()) === 0);
    ok("the menu is the school one (no till or products)", (await page.locator("aside nav").first().getByRole("link", { name: "Students" }).count()) === 1 && (await page.locator("aside nav").first().getByRole("link", { name: "Products" }).count()) === 0);
    await page.goto(`${APP}/en/dashboard/onboarding?step=2`);
    const school = page.getByTestId("onboarding-school");
    await school.waitFor({ timeout: 10000 });
    ok("step 2: the school checklist (settings, year and terms, subjects, classes, students), each with its page", (await school.locator("li").count()) === 5 && (await school.getByRole("link", { name: "Open" }).first().getAttribute("href")) === "/en/dashboard/school/settings");
    await page.screenshot({ path: "test-results/signup-school-setup.png", fullPage: true });
    await page.goto(`${APP}/en/dashboard/onboarding?step=3`);
    ok("step 3 speaks of parents' questions (fees, enrolment, calendar), with a school example", (await page.locator("main").getByText("Parents' questions").count()) >= 1 && (await page.getByText(/questions parents ask most/).count()) === 1 && (await page.getByText(/Which documents do I need to enrol my child/).count()) === 1 && (await page.getByText(/questions customers ask most/).count()) === 0);
    await page.goto(`${APP}/en/dashboard/onboarding?step=5`);
    ok("step 5: connect the school's number so parents can message the school (no 'business number')", (await page.getByText("Connect your school's number on the WhatsApp page — you can do it now or later.").count()) === 1 && (await page.getByText(/parents can message the school/).count()) === 1 && (await page.getByText(/business number/).count()) === 0);
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.waitForURL(/\/en\/dashboard\/school/, { timeout: 15000 });
    ok("finishing the setup lands on the School overview", /\/en\/dashboard\/school/.test(page.url()), page.url());
    await page.goto(`${APP}/en/dashboard/settings`);
    ok("Settings: the School profile, with School name (not Business profile)", (await page.locator("#business").getByText("School profile").count()) >= 1 && (await page.locator("#business").getByLabel("School name").count()) === 1 && (await page.getByText("Business profile").count()) === 0);

    // ---------------------------------------------------------------- A restaurant, chosen on the form (in French)
    const fr = await newPage("fr-FR");
    const R = { name: "Paul Tabi", business: "Chez Tabi", email: `signup-resto+${stamp}@example.com`, password: "Wazabolt2026" };
    // From the Nigeria page: the country (and so the currency) is carried to the setup screen.
    await fr.goto(`${APP}/fr/register?country=NG`);
    ok("sign-up without a vertical: no business type shown", (await fr.getByTestId("signup-vertical").count()) === 0);
    await fr.getByLabel("Votre nom").fill(R.name);
    await fr.getByLabel("E-mail", { exact: true }).fill(R.email);
    await fr.getByLabel("Mot de passe", { exact: true }).fill(R.password);
    await fr.getByRole("button", { name: "Créer mon compte" }).click();
    await fr.getByText("Vérifiez votre boîte mail").waitFor({ timeout: 10000 });
    await fr.goto(linkFrom(await latestMail(R.email, "Confirmez")));
    await fr.waitForURL(/\/fr\/dashboard\/setup/, { timeout: 15000 });
    ok("the country from the sign-up link pre-selects the currency: naira", (await fr.getByTestId("setup-currency").inputValue()) === "NG", fr.url());
    await fr.getByRole("button", { name: "Créer mon espace" }).click();
    await fr.getByText("Choisissez le type d'entreprise.").waitFor({ timeout: 10000 }).catch(() => {});
    ok("setup without a type: asks for it (in French)", (await fr.getByText("Choisissez le type d'entreprise.").count()) === 1);
    await fr.getByLabel("Nom de l'entreprise").fill(R.business);
    await fr.getByTestId("setup-type").getByText("Restaurant", { exact: true }).click();
    await fr.getByRole("button", { name: "Créer mon espace" }).click();
    await fr.waitForURL(/\/fr\/dashboard\?welcome=1/, { timeout: 15000 });
    ok("restaurant: the type and the currency chosen on the setup screen (naira, Nigeria, Lagos time)", industryOf(R.email) === "restaurant" && sql(`select b.currency || ' ' || b.country_code || ' ' || b.timezone from businesses b join business_members m on m.business_id = b.id join auth.users u on u.id = m.user_id where u.email = '${R.email}'`) === "NGN NG Africa/Lagos");
    await fr.goto(`${APP}/fr/dashboard/onboarding?step=1`);
    await fr.getByTestId("onboarding-steps").waitFor({ timeout: 15000 });
    const rflow = await fr.getByTestId("onboarding-steps").getAttribute("data-flow");
    ok("restaurant setup: profile, hours, menu, tables, FAQs, AI, WhatsApp", rflow === "profile,hours,menu,tables,faqs,ai,whatsapp", rflow);
    await fr.goto(`${APP}/fr/dashboard/onboarding?step=3`);
    ok("step 3 is the menu: « Ajouter un plat »", (await fr.locator("main").getByText("Votre menu", { exact: true }).count()) >= 1 && (await fr.getByRole("button", { name: "Ajouter un plat" }).count()) === 1, `${await fr.locator("main").innerText()}`.slice(0, 300));
    await fr.goto(`${APP}/fr/dashboard/onboarding?step=4`);
    await fr.getByLabel("Nom", { exact: true }).fill("Table 1");
    await fr.getByRole("button", { name: "Ajouter la table" }).click();
    await fr.getByTestId("onboarding-tables").waitFor({ timeout: 10000 });
    ok("step 4: a table is added during the setup", sql(`select count(*) from restaurant_tables t join business_members m on m.business_id = t.business_id join auth.users u on u.id = m.user_id where u.email = '${R.email}'`) === "1");
    await fr.screenshot({ path: "test-results/signup-restaurant-tables.png", fullPage: true });

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
