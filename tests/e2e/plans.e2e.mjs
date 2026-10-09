/*
 * End-to-end test of the plans without WhatsApp: the Boutique plan on the
 * pricing page, Free-plan limits as a shop sees them (products, monthly
 * sales, team, expenses, reports, profit), the grace notice for existing
 * shops, and Boutique unlocking what Free doesn't have.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:plans
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

async function register(page, u) {
  await page.goto(`${APP}/en/register`);
  await page.getByLabel("Your name").fill(u.name);
  await page.getByLabel("Business name").fill(u.business);
  await page.getByLabel("Email", { exact: true }).fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 10000 });
  await page.goto(linkFrom(await latestMail(u.email, "Confirm")));
  await page.waitForURL(/\/dashboard\/onboarding/);
}

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const OWNER = { name: "Paul Free", business: "Petite Boutique", email: `plans-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  try {
    // ---------------------------------------------------------------- pricing page
    await page.goto(`${APP}/en/pricing`);
    const pricing = await page.locator("#pricing").innerText();
    ok(
      "pricing page: five plans with Boutique at 5,000 FCFA and no WhatsApp AI; Free limits listed",
      /Boutique/.test(pricing) && /5,000/.test(pricing) && /No WhatsApp AI/.test(pricing) && /Up to 30 products/.test(pricing) && /Up to 100 sales \/ month/.test(pricing) && /Expenses and estimated profit/.test(pricing),
      pricing.replace(/\n/g, " | ").slice(0, 300),
    );
    await page.screenshot({ path: "test-results/plans-pricing.png", fullPage: false, clip: { x: 0, y: (await page.locator("#pricing").boundingBox()).y, width: 1440, height: 900 } });
    await page.goto(`${APP}/fr/pricing`);
    ok("pricing page in French: Boutique and Sans IA WhatsApp", /Boutique/.test(await page.locator("#pricing").innerText()) && /Sans IA WhatsApp/.test(await page.locator("#pricing").innerText()));

    // ---------------------------------------------------------------- a new Free shop: limits in force
    await register(page, OWNER);
    const bizId = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${bizId}'`);
    ok("a new shop starts on Free with the limits in force", sql(`select s.plan_id || ' ' || (b.free_limits_from <= current_date) from subscriptions s join businesses b on b.id = s.business_id where b.id = '${bizId}'`) === "free true");

    // Products: 30 allowed, the 31st refused with a clear message.
    sql(`insert into products (business_id, name, price, stock_quantity) select '${bizId}', 'Article ' || g, 1000, 50 from generate_series(1, 30) g`);
    await page.goto(`${APP}/en/dashboard/products/new`);
    await main.getByLabel("Name").fill("Article 31");
    await main.getByLabel("Selling price (FCFA)").fill("2000");
    await main.getByRole("button", { name: "Save" }).click();
    await main.getByText("Your plan's product limit is reached").waitFor({ timeout: 10000 });
    ok("Free: the 31st product is refused with an upgrade message", sql(`select count(*) from products where business_id = '${bizId}'`) === "30");

    // Sales: 100 this month allowed (recorded directly), the 101st refused at the till.
    sql(`insert into orders (business_id, order_number, status, channel, subtotal, total) select '${bizId}', 'T-' || g, 'delivered', 'pos', 1000, 1000 from generate_series(1, 100) g`);
    await page.goto(`${APP}/en/dashboard/sales/new`);
    await main.getByPlaceholder("Search products by name or SKU").waitFor({ timeout: 15000 });
    await main.getByRole("button", { name: /^Article 1 —/ }).click();
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await main.getByText("Your plan's sales limit for this month is reached").waitFor({ timeout: 10000 });
    ok("Free: the 101st sale of the month is refused at the till, stock untouched", sql(`select stock_quantity from products where business_id = '${bizId}' and name = 'Article 1'`) === "50");

    // Team: one user only.
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`helper+${stamp}@example.com`);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByText("Your plan's user limit is reached").waitFor({ timeout: 10000 });
    ok("Free: inviting a second user is refused with an upgrade message", sql(`select count(*) from business_invitations where business_id = '${bizId}'`) === "0");

    // Expenses, profit and reports.
    await page.goto(`${APP}/en/dashboard/expenses`);
    ok("Free: the expenses page explains it needs a paid plan", /Expenses need a paid plan/.test(await main.innerText()) && (await main.getByRole("button", { name: "Add an expense" }).count()) === 0);
    await page.goto(`${APP}/en/dashboard`);
    await main.getByTestId("business-overview").waitFor({ timeout: 15000 });
    ok("Free: the dashboard shows no profit, and says where to get it", (await main.getByTestId("today-profit").count()) === 0 && /Estimated profit and expenses are included from the Boutique plan/.test(await main.innerText()));
    await page.goto(`${APP}/en/dashboard/reports?range=30d`);
    await main.getByText(/reports cover the last 7 days/).waitFor({ timeout: 15000 }).catch(() => {});
    const report = await main.innerText();
    ok(
      "Free: reports cover the last 7 days, without costs or profit",
      /reports cover the last 7 days/.test(report) && !/Gross profit/.test(report) && !/Cost of goods sold/.test(report),
      (await main.getByTestId("report-period").innerText()),
    );
    const csv = await page.request.get(`${APP}/en/dashboard/reports/export?type=expenses&from=2026-01-01&to=2030-01-01`);
    ok("Free: the expenses CSV is refused", csv.status() === 403, String(csv.status()));

    // Billing: usage and the plans.
    await page.goto(`${APP}/en/dashboard/billing`);
    const usage = await main.getByTestId("plan-usage").innerText();
    ok("billing: usage against the Free limits (30 of 30 products, 100 of 100 sales, 1 of 1 user)", /30 of 30/.test(usage) && /100 of 100/.test(usage) && /1 of 1/.test(usage), usage.replace(/\n/g, " | "));
    ok("billing: Boutique is offered at 5,000 FCFA", /Boutique/.test(await main.innerText()) && /5,000 FCFA/.test(await main.innerText()));
    await page.screenshot({ path: "test-results/plans-billing-free.png", fullPage: true });

    // ---------------------------------------------------------------- grace: an existing shop keeps everything until its date
    sql(`update businesses set free_limits_from = '2026-12-01' where id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard`);
    await page.getByTestId("plan-grace-notice").waitFor({ timeout: 15000 });
    ok("grace: existing shops see when the Free limits start, with the Boutique price", /From 1 Dec 2026/.test(await page.getByTestId("plan-grace-notice").innerText()) && /5,000 FCFA/.test(await page.getByTestId("plan-grace-notice").innerText()), await page.getByTestId("plan-grace-notice").innerText());
    await page.goto(`${APP}/en/dashboard/expenses`);
    await main.getByRole("button", { name: "Add an expense" }).waitFor({ timeout: 15000 }).catch(() => {});
    ok("grace: expenses still available until then", (await main.getByRole("button", { name: "Add an expense" }).count()) === 1);

    // ---------------------------------------------------------------- Boutique: unlimited products and sales, expenses and profit, still 1 user
    sql(`update businesses set free_limits_from = current_date where id = '${bizId}'`);
    sql(`update subscriptions set plan_id = 'boutique' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard/products/new`);
    await main.getByLabel("Name").fill("Article 31");
    await main.getByLabel("Selling price (FCFA)").fill("2000");
    await main.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/dashboard\/products\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    await page.goto(`${APP}/en/dashboard/sales/new`);
    await main.getByPlaceholder("Search products by name or SKU").waitFor({ timeout: 15000 });
    await main.getByRole("button", { name: /^Article 1 —/ }).click();
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}\?new=1/, { timeout: 15000 });
    ok("Boutique: a 31st product and a 101st sale go through", sql(`select count(*) from products where business_id = '${bizId}'`) === "31");
    await page.goto(`${APP}/en/dashboard/expenses`);
    ok("Boutique: expenses available", (await main.getByRole("button", { name: "Add an expense" }).count()) === 1);
    await page.goto(`${APP}/en/dashboard`);
    await main.getByTestId("business-overview").waitFor({ timeout: 15000 });
    ok("Boutique: estimated profit on the dashboard, no grace notice", (await main.getByTestId("today-profit").count()) === 1 && (await page.getByTestId("plan-grace-notice").count()) === 0);
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`helper2+${stamp}@example.com`);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByText("Your plan's user limit is reached").waitFor({ timeout: 10000 });
    ok("Boutique: still one user", true);
    await page.goto(`${APP}/en/dashboard/billing`);
    await page.screenshot({ path: "test-results/plans-billing-boutique.png", fullPage: true });

    ok("no browser errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    results.push(`CRASH ${e.message}`);
    process.exitCode = 1;
    await page.screenshot({ path: "test-results/plans-crash.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log(results.join("\n"));
  }
})();
