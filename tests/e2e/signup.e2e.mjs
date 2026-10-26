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
import { chromium } from "playwright";

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
    // ---------------------------------------------------------------- The marketing pages pass the type along
    const page = await newPage();
    await page.goto(`${APP}/en/solutions/schools`);
    ok("the schools page's Start free goes to sign-up with the school type", (await page.locator('main a[href="/en/register?type=schools"]').count()) >= 1);

    // ---------------------------------------------------------------- A school, from the schools page
    const S = { name: "Marie Ngo", business: "Collège La Réussite", email: `signup-school+${stamp}@example.com`, password: "Wazabolt2026" };
    await page.goto(`${APP}/en/register?type=schools`);
    const picker = page.getByTestId("business-type");
    ok("sign-up: School is pre-selected when coming from the schools page", await picker.getByLabel("School").isChecked());
    await page.getByLabel("Your name").fill(S.name);
    await page.getByLabel("Business name").fill(S.business);
    await page.getByLabel("Email", { exact: true }).fill(S.email);
    await page.getByLabel("Password", { exact: true }).fill(S.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    ok("before the email is confirmed, the business has no type yet", industryOf(S.email) === "-");
    await page.goto(linkFrom(await latestMail(S.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/onboarding\?step=1/, { timeout: 15000 });
    ok("confirming the email sets the business type: school", industryOf(S.email) === "school");
    const flow = await page.getByTestId("onboarding-steps").getAttribute("data-flow");
    ok("the setup is the school one: profile, school, FAQs, AI, WhatsApp (no products)", flow === "profile,school,faqs,ai,whatsapp", flow);
    ok("…step 1 of 5, with School already chosen", (await page.getByText("Step 1 of 5").count()) === 1 && (await page.locator('main select[name="industry"]').inputValue()) === "school");
    ok("the menu is the school one (no till or products)", (await page.locator("aside nav").first().getByRole("link", { name: "Students" }).count()) === 1 && (await page.locator("aside nav").first().getByRole("link", { name: "Products" }).count()) === 0);
    await page.goto(`${APP}/en/dashboard/onboarding?step=2`);
    const school = page.getByTestId("onboarding-school");
    await school.waitFor({ timeout: 10000 });
    ok("step 2: the school checklist (settings, year and terms, subjects, classes, students), each with its page", (await school.locator("li").count()) === 5 && (await school.getByRole("link", { name: "Open" }).first().getAttribute("href")) === "/en/dashboard/school/settings");
    await page.screenshot({ path: "test-results/signup-school-setup.png", fullPage: true });
    await page.goto(`${APP}/en/dashboard/onboarding?step=5`);
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.waitForURL(/\/en\/dashboard\/school/, { timeout: 15000 });
    ok("finishing the setup lands on the School overview", /\/en\/dashboard\/school/.test(page.url()), page.url());

    // ---------------------------------------------------------------- A restaurant, chosen on the form (in French)
    const fr = await newPage("fr-FR");
    const R = { name: "Paul Tabi", business: "Chez Tabi", email: `signup-resto+${stamp}@example.com`, password: "Wazabolt2026" };
    await fr.goto(`${APP}/fr/register`);
    await fr.getByRole("button", { name: "Créer mon compte" }).click();
    ok("sign-up without a type: asks for it (in French)", (await fr.getByText("Choisissez le type d'entreprise.").count()) === 1);
    await fr.getByLabel("Votre nom").fill(R.name);
    await fr.getByLabel("Nom de l'entreprise").fill(R.business);
    await fr.getByTestId("business-type").getByText("Restaurant", { exact: true }).click();
    await fr.getByLabel("E-mail", { exact: true }).fill(R.email);
    await fr.getByLabel("Mot de passe", { exact: true }).fill(R.password);
    await fr.getByRole("button", { name: "Créer mon compte" }).click();
    await fr.getByText("Vérifiez votre boîte mail").waitFor({ timeout: 10000 });
    await fr.goto(linkFrom(await latestMail(R.email, "Confirmez")));
    await fr.waitForURL(/\/fr\/dashboard\/onboarding\?step=1/, { timeout: 15000 });
    ok("restaurant: business type set on confirmation", industryOf(R.email) === "restaurant");
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
