/*
 * End-to-end test of countries: signing up in Zimbabwe (US dollars, Harare
 * time), prices and sales with cents, Zimbabwe phone numbers, the shop page in
 * dollars, the country locked once a sale is recorded, the Billing notice, and
 * a Cameroon business moving to Zimbabwe before its first sale.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... node tests/e2e/countries.e2e.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "./playwright.mjs";

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
  await page.getByTestId("business-type").getByText("Shop", { exact: true }).click();
  if (u.country) await page.getByTestId("signup-country").selectOption(u.country);
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
  const OWNER = { name: "Tendai Moyo", business: `Moyo Hardware ${stamp}`, email: `zw-owner+${stamp}@example.com`, password: "Wazabolt2026", country: "ZW" };
  const CM = { name: "Awa Fon", business: `Awa Styles ${stamp}`, email: `cm-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  try {
    // ---------------------------------------------------------------- sign-up in Zimbabwe
    await page.goto(`${APP}/en/register`);
    const options = await page.getByTestId("signup-country").locator("option").allInnerTexts();
    ok("sign-up offers the country (Cameroon by default, Zimbabwe)", options.join(" / ") === "Cameroon (FCFA) / Zimbabwe (US dollars)" && (await page.getByTestId("signup-country").inputValue()) === "CM", options.join(" / "));
    await register(page, OWNER);
    const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${biz}'`);
    ok("the business is set up in US dollars, Harare time, English", sql(`select country_code || ' ' || currency || ' ' || timezone from businesses where id = '${biz}'`) === "ZW USD Africa/Harare");

    // ---------------------------------------------------------------- prices with cents
    await page.goto(`${APP}/en/dashboard/products/new`);
    await main.getByLabel("Name").fill("Claw hammer");
    await main.getByLabel("Selling price (USD)").fill("12.50");
    await main.getByRole("button", { name: "Save" }).click();
    await page.waitForURL((u) => /\/dashboard\/products/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 15000 });
    ok("a price in US dollars keeps its cents", sql(`select price from products where business_id = '${biz}' and name = 'Claw hammer'`) === "12.50");
    await page.goto(`${APP}/en/dashboard/products`);
    ok("…and shows as 12.50 USD", (await main.getByText("12.50 USD").count()) >= 1);

    // ---------------------------------------------------------------- a sale at the till
    await page.goto(`${APP}/en/dashboard/sales/new`);
    await main.getByPlaceholder("Search products by name or SKU").waitFor({ timeout: 15000 });
    await main.getByRole("button", { name: /^Claw hammer —/ }).click();
    await main.getByRole("button", { name: /^Claw hammer —/ }).click();
    ok("the till adds up in dollars and cents (2 × 12.50 = 25.00 USD)", (await main.getByText("25.00 USD").count()) >= 1);
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}/, { timeout: 15000 });
    ok("the sale is recorded in US dollars", sql(`select currency || ' ' || total from orders where business_id = '${biz}'`) === "USD 25.00");
    ok("…and the receipt shows 25.00 USD", (await main.getByText("25.00 USD").count()) >= 1);

    // ---------------------------------------------------------------- a Zimbabwe phone number
    await page.goto(`${APP}/en/dashboard/customers/new`);
    await main.getByLabel("Name").fill("Rudo Chikwanha");
    await main.getByLabel("WhatsApp number").fill("077 123 4567");
    await main.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/dashboard\/customers\/[0-9a-f-]{36}/, { timeout: 15000 });
    ok("a local Zimbabwe number (077 123 4567) is saved as +263 77 123 4567", sql(`select whatsapp_phone from customers where business_id = '${biz}' and name = 'Rudo Chikwanha'`) === "263771234567");

    // ---------------------------------------------------------------- Settings and Billing
    await page.goto(`${APP}/en/dashboard/settings`);
    await main.getByLabel("Change the country").selectOption("CM");
    await main.getByRole("button", { name: "Change country" }).click();
    await main.getByText(/can't change once sales, invoices or expenses are recorded/).waitFor({ timeout: 10000 });
    ok("after a sale the country (currency) can't change, with a clear message", sql(`select currency from businesses where id = '${biz}'`) === "USD");
    await page.goto(`${APP}/en/dashboard/billing`);
    ok("billing explains prices are in FCFA for now, and that the team will contact them", /Prices in USD are coming soon/.test(await page.getByTestId("other-country").innerText()));

    // ---------------------------------------------------------------- the public shop page in dollars
    sql(`update businesses set shop_enabled = true, phone = '+263 77 123 4567' where id = '${biz}'`);
    const slug = sql(`select slug from businesses where id = '${biz}'`);
    const shop = await (await browser.newContext()).newPage();
    await shop.goto(`${APP}/s/${slug}`);
    ok("the shop page shows 12.50 USD and orders go to the +263 number", (await shop.getByText("12.50 USD").count()) >= 1 && (await shop.getByRole("link", { name: "Order on WhatsApp" }).getAttribute("href")).startsWith("https://wa.me/263771234567"));
    await page.screenshot({ path: "test-results/country-zw-billing.png", fullPage: true });

    // ---------------------------------------------------------------- a Cameroon business moves to Zimbabwe before selling
    const page2 = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" })).newPage();
    page2.on("pageerror", (e) => errors.push(String(e)));
    await register(page2, CM);
    const cm = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${CM.email}'`);
    ok("without a choice, a sign-up is in Cameroon (FCFA)", sql(`select country_code || ' ' || currency from businesses where id = '${cm}'`) === "CM XAF");
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${cm}'`);
    await page2.goto(`${APP}/en/dashboard/settings`);
    await page2.locator("main").getByLabel("Change the country").selectOption("ZW");
    await page2.locator("main").getByRole("button", { name: "Change country" }).click();
    await page2.locator("main").getByText("Country changed.").waitFor({ timeout: 10000 });
    ok("before any sale, the owner moves the business to Zimbabwe (USD, Harare)", sql(`select country_code || ' ' || currency || ' ' || timezone from businesses where id = '${cm}'`) === "ZW USD Africa/Harare");

    ok("no browser errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
