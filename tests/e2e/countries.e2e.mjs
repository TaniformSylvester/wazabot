/*
 * End-to-end test of countries: signing up in Zimbabwe (US dollars, Harare
 * time), prices and sales with cents, Zimbabwe phone numbers, the shop page in
 * dollars, the country locked once a sale is recorded, plans in US dollars
 * (request, team email, approval by bank transfer), and
 * a Cameroon business moving to Zimbabwe before its first sale.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... node tests/e2e/countries.e2e.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { startFakeResend } from "./fake-resend.mjs";
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
  // The app's own emails (Resend) go to a local stand-in; sign-up confirmations go to Mailpit.
  const resend = await startFakeResend(4030);
  const emailTo = async (to, subject) => {
    for (let i = 0; i < 20; i++) {
      const e = resend.emails.find((x) => x.to.includes(to) && x.subject.includes(subject));
      if (e) return e;
      await sleep(500);
    }
    return null;
  };
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
    ok("sign-up offers the country (Cameroon by default; Zimbabwe, Nigeria, South Africa, Ghana, Kenya)", options.join(" / ") === "Cameroon (FCFA) / Zimbabwe (US dollars) / Nigeria (naira) / South Africa (rand) / Ghana (cedi) / Kenya (shillings)" && (await page.getByTestId("signup-country").inputValue()) === "CM", options.join(" / "));
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
    ok("billing says prices are in USD, paid by bank transfer, with the bank details sent by the team", /prices are in USD, paid by bank transfer.*send you the bank details/.test(await page.getByTestId("other-country").innerText()));
    const card = async (id) => (await main.getByTestId(`billing-plan-${id}`).innerText()).replace(/\s+/g, " ");
    ok("the plans are $5, $12 and $25 a month, yearly 10 months for 12", /5\.00 USD\/month.*50\.00 USD\/year/.test(await card("boutique")) && /12\.00 USD\/month.*120\.00 USD\/year/.test(await card("business")) && /25\.00 USD\/month.*250\.00 USD\/year/.test(await card("multishop")), await card("business"));
    ok("no FCFA and no Mobile Money on a dollar business's Billing", !/FCFA|Mobile Money/.test(await main.innerText()));
    ok("the multi-shop plan doesn't offer FCFA-priced extra shops", /Up to 3 shops/.test(await card("multishop")) && !/more:/.test(await card("multishop")));
    await main.getByLabel("Plan", { exact: true }).selectOption("business");
    await main.getByLabel("How often to pay").selectOption("year");
    await main.getByLabel("Phone or WhatsApp number to reach you").fill("+263 77 123 4567");
    await main.getByRole("button", { name: "Send request" }).click();
    await main.getByText("Plan requested").waitFor({ timeout: 10000 });
    const requestId = sql(`select id from plan_change_requests where business_id = '${biz}' and status = 'pending'`);
    const team = await emailTo("contact@wazabolt.com", `New plan request – ${OWNER.business}`);
    ok("the team's email asks for 120.00 USD by bank transfer", !!team && team.html.includes("120.00 USD") && team.html.includes("bank transfer") && !team.html.includes("FCFA"), team?.subject);
    // The WazaBolt team approves it in admin (this owner stands in for the team).
    sql(`insert into platform_admins (user_id) select id from auth.users where email = '${OWNER.email}'`);
    await page.goto(`${APP}/en/admin/plan-requests`);
    const req = page.locator(`li[data-request-id="${requestId}"]`);
    await req.waitFor({ timeout: 10000 });
    ok("admin: the request shows 120.00 USD by bank transfer, amount and method filled in", /yearly: 120\.00 USD by bank transfer/.test(await req.innerText()) && (await req.getByLabel("Amount received (USD)").inputValue()) === "120" && (await req.getByLabel("Paid by").inputValue()) === "bank");
    await req.getByLabel("Reference (optional)").fill("ZW-TT-0001");
    await req.getByRole("button", { name: "Approve" }).click();
    await page.getByText(/Approved — the payment is recorded/).waitFor({ timeout: 10000 });
    ok("approving records 120.00 USD by bank transfer", sql(`select amount || ' ' || currency || ' ' || method from subscription_payments where request_id = '${requestId}'`) === "120.00 USD bank");
    // The team saves the bank account for US dollar payments (admin → Businesses).
    sql(`delete from platform_settings where key = 'usd_bank_details'`);
    await page.goto(`${APP}/en/admin/businesses#bank`);
    const bankForm = page.getByRole("form", { name: "Bank details for US dollar payments" });
    await bankForm.getByLabel("SWIFT / BIC").fill("bad");
    await bankForm.getByRole("button", { name: "Save bank details" }).click();
    await page.getByText(/weren't saved/).waitFor({ timeout: 10000 });
    ok("admin: incomplete bank details are refused", sql(`select count(*) from platform_settings where key = 'usd_bank_details'`) === "0");
    for (const [label, v] of [["Beneficiary name", "WazaBolt ENTERPRISE"], ["Bank name", "Test Bank"], ["Bank address", "1 Test Street, New York, USA"], ["SWIFT / BIC", "testus33"], ["Account number", "000123456789"], ["Account type", "Checking"]]) await bankForm.getByLabel(label, { exact: true }).fill(v);
    await bankForm.getByRole("button", { name: "Save bank details" }).click();
    await page.getByText(/Bank details saved/).waitFor({ timeout: 10000 });
    ok("admin: the bank details are saved (SWIFT in capitals)", sql(`select value->>'swift' || ' ' || (value->>'accountNumber') from platform_settings where key = 'usd_bank_details'`) === "TESTUS33 000123456789");
    sql(`delete from platform_admins where user_id = (select id from auth.users where email = '${OWNER.email}')`);
    await page.goto(`${APP}/en/dashboard/billing`);
    ok("Billing shows the plan at 120.00 USD a year and the payment in USD", /120\.00 USD\/year/.test(await main.getByTestId("current-plan").innerText()) && (await main.locator("#payments").getByText("120.00 USD").count()) === 1);
    const bankBox = (await main.getByTestId("bank-details").innerText()).replace(/\s+/g, " ");
    ok("Billing shows where to send the dollars: beneficiary, bank, SWIFT, account and the business name as reference", /WazaBolt ENTERPRISE/.test(bankBox) && /TESTUS33/.test(bankBox) && /000123456789/.test(bankBox) && bankBox.includes(OWNER.business), bankBox);
    ok("…and says to pay to the account below", /paid by bank transfer to the account below/.test(await page.getByTestId("other-country").innerText()));

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
    await page2.goto(`${APP}/en/dashboard/billing`);
    ok("a Cameroon business (FCFA, Mobile Money) never sees the dollar bank details", (await page2.locator("main").getByTestId("bank-details").count()) === 0);
    await page2.goto(`${APP}/en/dashboard/settings`);
    await page2.locator("main").getByLabel("Change the country").selectOption("ZW");
    await page2.locator("main").getByRole("button", { name: "Change country" }).click();
    await page2.locator("main").getByText("Country changed.").waitFor({ timeout: 10000 });
    ok("before any sale, the owner moves the business to Zimbabwe (USD, Harare)", sql(`select country_code || ' ' || currency || ' ' || timezone from businesses where id = '${cm}'`) === "ZW USD Africa/Harare");

    // ---------------------------------------------------------------- Kenya: shillings, +254, and 07… numbers that are Kenyan here
    const KE = { name: "Wanjiru Kamau", business: `Kamau Stores ${stamp}`, email: `ke-owner+${stamp}@example.com`, password: "Wazabolt2026", country: "KE" };
    const page3 = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" })).newPage();
    page3.on("pageerror", (e) => errors.push(String(e)));
    await register(page3, KE);
    const ke = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${KE.email}'`);
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${ke}'`);
    ok("a Kenya sign-up is in shillings, Nairobi time, English", sql(`select country_code || ' ' || currency || ' ' || timezone from businesses where id = '${ke}'`) === "KE KES Africa/Nairobi");
    await page3.goto(`${APP}/en/dashboard/customers/new`);
    await page3.locator("main").getByLabel("Name").fill("Otieno Mwangi");
    await page3.locator("main").getByLabel("WhatsApp number").fill("0712 345 678");
    await page3.locator("main").getByRole("button", { name: "Save" }).click();
    await page3.waitForURL(/\/dashboard\/customers\/[0-9a-f-]{36}/, { timeout: 15000 });
    ok("in Kenya, 0712 345 678 is saved as +254 712 345 678 (not Zimbabwe's +263)", sql(`select whatsapp_phone from customers where business_id = '${ke}' and name = 'Otieno Mwangi'`) === "254712345678");
    await page3.goto(`${APP}/en/dashboard/products/new`);
    await page3.locator("main").getByLabel("Name").fill("Unga 2kg");
    await page3.locator("main").getByLabel("Selling price (KES)").fill("250");
    await page3.locator("main").getByRole("button", { name: "Save" }).click();
    await page3.waitForURL((u) => /\/dashboard\/products/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 15000 });
    await page3.goto(`${APP}/en/dashboard/products`);
    ok("prices in shillings show in whole units (250 KES)", (await page3.locator("main").getByText("250 KES").count()) >= 1);
    await page3.goto(`${APP}/en/dashboard/billing`);
    ok("billing: a Kenyan business pays its plan in US dollars by bank transfer", /prices are in USD, paid by bank transfer/.test(await page3.getByTestId("other-country").innerText()));
    ok("…$5, $12 and $25 a month, like Zimbabwe", /5\.00 USD\/month/.test(await page3.getByTestId("billing-plan-boutique").innerText()) && /12\.00 USD\/month/.test(await page3.getByTestId("billing-plan-business").innerText()) && /25\.00 USD\/month/.test(await page3.getByTestId("billing-plan-multishop").innerText()));

    ok("no browser errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    resend.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
