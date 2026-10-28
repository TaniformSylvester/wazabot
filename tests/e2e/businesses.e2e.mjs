/*
 * End-to-end test of several businesses under one login: an owner with a
 * Free shop adds a restaurant, which needs a paid plan (one Free business per
 * owner) and stays on Billing with its plan request until WazaBolt approves
 * it; the switcher moves between the two and their data stays apart; once the
 * plan is approved the restaurant gets its own setup; with no Free business
 * left, a new one is Free and opens straight away (in French).
 * Against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:businesses
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

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));

  try {
    // ---------------------------------------------------------------- Not signed in: login
    await page.goto(`${APP}/en/dashboard/businesses/new`);
    ok("signed out: Add a business asks to log in", /\/en\/login/.test(page.url()), page.url());

    // ---------------------------------------------------------------- An owner with a Free shop
    const U = { email: `multi+${stamp}@example.com`, password: "Wazabolt2026" };
    await page.goto(`${APP}/en/register`);
    await page.getByLabel("Your name").fill("Awa Fon");
    await page.getByLabel("Business name").fill("Awa Styles");
    await page.getByTestId("business-type").getByText("Shop", { exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(U.email);
    await page.getByLabel("Password", { exact: true }).fill(U.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    await page.goto(linkFrom(await latestMail(U.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/onboarding/, { timeout: 15000 });
    const userId = sql(`select id from auth.users where email = '${U.email}'`);
    const first = sql(`select business_id from business_members where user_id = '${userId}'`);

    const add = page.locator("aside").getByRole("link", { name: "Add a business" });
    ok("the side panel has Add a business", (await add.count()) === 1);
    await add.click();
    await page.waitForURL(/\/en\/dashboard\/businesses\/new/, { timeout: 10000 });
    const box = page.getByTestId("needs-paid-plan");
    await box.waitFor({ timeout: 10000 }).catch(() => {});
    ok("with a Free shop already, the new business needs a paid plan (and says which business is Free)", (await box.count()) === 1 && (await box.innerText()).includes("Awa Styles"));
    const planOptions = await page.locator('select[name="plan_id"] option').allInnerTexts();
    ok("only paid plans are offered", planOptions.length >= 3 && !planOptions.some((o) => /^Free/.test(o)), planOptions.join(" / "));

    await page.getByRole("button", { name: "Create the business" }).click();
    await page.getByText("Enter your business name.").waitFor({ timeout: 10000 }).catch(() => {});
    ok("a name is required", (await page.getByText("Enter your business name").count()) >= 1 || (await page.locator('input[name="name"][aria-invalid="true"]').count()) === 1);
    await page.getByLabel("Business name").fill("Chez Awa");
    await page.getByLabel("Type of business").selectOption("restaurant");
    await page.locator('select[name="plan_id"]').selectOption("starter");
    await page.locator('select[name="billing_interval"]').selectOption("year");
    await page.getByLabel("Phone or WhatsApp number to reach you").fill("+237 677 00 00 00");
    await page.screenshot({ path: "test-results/businesses-new-paid.png", fullPage: true });
    await page.getByRole("button", { name: "Create the business" }).click();
    await page.waitForURL(/\/en\/dashboard\/billing\?new=1/, { timeout: 15000 });
    const second = sql(`select b.id from businesses b join business_members m on m.business_id = b.id where m.user_id = '${userId}' and b.name = 'Chez Awa'`);
    ok("the restaurant is created, owned by the same login", !!second && sql(`select role from business_members where business_id = '${second}' and user_id = '${userId}'`) === "owner");
    ok("…as a restaurant, on Free until its plan is approved", sql(`select b.industry || ' ' || s.plan_id || ' ' || b.needs_paid_plan from businesses b join subscriptions s on s.business_id = b.id where b.id = '${second}'`) === "restaurant free true");
    ok("…with its plan request: Starter, yearly, with the phone number", sql(`select to_plan_id || ' ' || billing_interval || ' ' || status || ' ' || contact_phone from plan_change_requests where business_id = '${second}'`) === "starter year pending +237 677 00 00 00");
    await page.getByTestId("awaiting-plan").waitFor({ timeout: 15000 }).catch(() => {});
    ok("Billing explains the business opens once its plan is approved", (await page.getByTestId("awaiting-plan").count()) === 1 && (await page.getByText("Plan change requested").count()) === 1);
    await page.screenshot({ path: "test-results/businesses-awaiting-plan.png", fullPage: true });

    const leadsToBilling = async (path) => {
      await page.goto(`${APP}${path}`);
      await page.waitForURL(/\/en\/dashboard\/billing/, { timeout: 15000 }).catch(() => {});
      await page.getByTestId("awaiting-plan").waitFor({ timeout: 15000 }).catch(() => {});
      return /\/en\/dashboard\/billing/.test(page.url());
    };
    ok("until then, other pages lead back to Billing", await leadsToBilling("/en/dashboard/products"), page.url());
    ok("…WhatsApp too", await leadsToBilling("/en/dashboard/whatsapp"), page.url());

    // ---------------------------------------------------------------- Switching
    const switcher = page.locator("header select");
    ok("the header switcher lists both businesses", (await switcher.locator("option").allInnerTexts()).join(",") === "Awa Styles,Chez Awa");
    await switcher.selectOption(first);
    await page.waitForURL(/\/en\/dashboard(\/onboarding.*)?$/, { timeout: 15000 });
    await page.goto(`${APP}/en/dashboard/products`);
    await page.getByRole("heading", { name: "Products" }).first().waitFor({ timeout: 15000 }).catch(() => {});
    ok("switching to the Free shop: it works as usual", /\/en\/dashboard\/products/.test(page.url()) && (await switcher.inputValue()) === first, page.url());
    sql(`insert into products (business_id, name, price) values ('${first}', 'Robe Ankara', 15000)`);
    ok("each business keeps its own data", sql(`select count(*) from products where business_id = '${second}'`) === "0");

    // ---------------------------------------------------------------- WazaBolt approves the plan (as the admin page does)
    sql(`update subscriptions set plan_id = 'starter', billing_interval = 'year' where business_id = '${second}'; update plan_change_requests set status = 'approved', decided_at = now() where business_id = '${second}'`);
    await switcher.selectOption(second);
    await page.waitForURL(/\/en\/dashboard\/onboarding/, { timeout: 15000 });
    await page.getByTestId("onboarding-steps").waitFor({ timeout: 15000 });
    const flow = await page.getByTestId("onboarding-steps").getAttribute("data-flow");
    ok("once approved, the restaurant opens on its own setup (menu and tables)", flow === "profile,hours,menu,tables,faqs,ai,whatsapp", flow);
    await page.goto(`${APP}/en/dashboard/products`);
    await page.getByRole("heading", { name: "Products" }).first().waitFor({ timeout: 15000 }).catch(() => {});
    ok("…and its pages open", !/\/billing/.test(page.url()), page.url());

    // ---------------------------------------------------------------- No Free business left: the next one is Free (French)
    sql(`update subscriptions set plan_id = 'starter' where business_id = '${first}'`);
    await page.goto(`${APP}/fr/dashboard/businesses/new`);
    await page.getByLabel("Nom de l'entreprise").waitFor({ timeout: 15000 });
    ok("in French: « Ajouter une entreprise », no paid plan needed when no business is on Free", (await page.getByRole("heading", { name: "Ajouter une entreprise" }).count()) >= 1 && (await page.getByTestId("needs-paid-plan").count()) === 0);
    await page.getByLabel("Nom de l'entreprise").fill("Awa Couture");
    await page.getByRole("button", { name: "Créer l'entreprise" }).click();
    await page.waitForURL(/\/fr\/dashboard\/onboarding/, { timeout: 15000 });
    await page.getByTestId("onboarding-steps").waitFor({ timeout: 15000 });
    const third = sql(`select b.id from businesses b join business_members m on m.business_id = b.id where m.user_id = '${userId}' and b.name = 'Awa Couture'`);
    ok("…it's created on Free and opens on its setup", !!third && sql(`select s.plan_id || ' ' || b.needs_paid_plan from businesses b join subscriptions s on s.business_id = b.id where b.id = '${third}'`) === "free false");
    ok("…and it's the one now open", (await page.locator("header select").inputValue()) === third);
    ok("no plan request for a Free business", sql(`select count(*) from plan_change_requests where business_id = '${third}'`) === "0");

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
