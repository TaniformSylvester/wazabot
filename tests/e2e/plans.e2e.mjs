/*
 * End-to-end test of the plans: the pricing page (three plans, monthly and
 * annual, the AI assistant coming soon), a new shop's 14-day trial, what
 * Boutique leaves out (with upgrade prompts, enforced on the server), what
 * Business adds, read-only once a trial ends, the WazaBolt team's controls
 * (setup fee, extending a trial, recording a payment, launching the AI) and
 * the AI add-on with the WhatsApp (Meta) fees notice.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:plans
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
  const OWNER = { name: "Paul Mbah", business: "Petite Boutique", email: `plans-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");
  const plain = (t) => t.replace(/[\u00a0\u202f]/g, " ");

  try {
    // ---------------------------------------------------------------- pricing page
    await page.goto(`${APP}/en/pricing`);
    const pricing = plain(await page.locator("#pricing").innerText());
    ok("pricing: Boutique 3,000, Business 7,500, Multi-shop 15,000 FCFA a month", /Boutique[\s\S]*3,000 FCFA[\s\S]*Business[\s\S]*7,500 FCFA[\s\S]*Multi-shop[\s\S]*15,000 FCFA/.test(pricing), pricing.slice(0, 300));
    ok("…each card says what it includes, with a 14-day free trial", /1 user/.test(pricing) && /Up to 3 users/.test(pricing) && /Everything in Boutique/.test(pricing) && /Estimated profit/.test(pricing) && /14 days free/.test(pricing));
    ok("…the AI assistant is a separate add-on, coming soon", (await page.getByTestId("ai-coming-soon").count()) === 1 && /\+5,000 FCFA\/month/.test(pricing) && /11,500 FCFA\/month instead of 12,500 FCFA/.test(pricing));
    ok("…nothing about Meta fees", !/Meta/.test(pricing));
    await page.getByTestId("billing-toggle").getByRole("radio", { name: /Annual/ }).click();
    const biz = page.getByTestId("plans-XAF-shop").getByTestId("plan-card-business");
    ok("annual: 10 months for 12 (30,000 · 75,000 · 150,000 FCFA a year)", (await biz.getByTestId("price-year").isVisible()) && /75,000 FCFA/.test(plain(await biz.innerText())) && !(await biz.getByTestId("price-month").isVisible()));
    // The two switches: where the business is (FCFA / US dollars) and its type (shops and restaurants / schools).
    await page.getByTestId("billing-toggle").getByRole("radio", { name: /Monthly/ }).click();
    await page.getByTestId("currency-switch").getByRole("radio", { name: /Other countries/ }).click();
    const usd = plain(await page.getByTestId("plans-USD-shop").innerText());
    ok("other countries: $5, $12 and $25 a month, up to 3 shops with no extra-shop price in FCFA", (await page.getByTestId("plans-USD-shop").isVisible()) && !(await page.getByTestId("plans-XAF-shop").isVisible()) && /\$5\b[\s\S]*\$12\b[\s\S]*\$25\b/.test(usd) && /Up to 3 shops/.test(usd) && !/FCFA/.test(usd), usd.slice(0, 400));
    await page.getByTestId("audience-switch").getByRole("radio", { name: /Schools/ }).click();
    const usdSchool = plain(await page.getByTestId("plans-USD-school").innerText());
    ok("schools in US dollars: School Starter $5, School Standard $12, School Plus $25, students and 30 free teachers", (await page.getByTestId("plans-USD-school").isVisible()) && /School Starter[\s\S]*School Standard[\s\S]*School Plus/.test(usdSchool) && /Up to 200 students/.test(usdSchool) && /Up to 500 students/.test(usdSchool) && /30 free teacher accounts/.test(usdSchool), usdSchool.slice(0, 400));
    await page.getByTestId("currency-switch").getByRole("radio", { name: /Cameroon/ }).click();
    const xafSchool = plain(await page.getByTestId("plans-XAF-school").innerText());
    ok("schools in FCFA: 3,000 · 7,500 · 15,000 FCFA", /3,000 FCFA[\s\S]*7,500 FCFA[\s\S]*15,000 FCFA/.test(xafSchool));
    const notes = plain(await page.getByTestId("pricing-notes").innerText());
    ok("pricing notes: Business trial once per owner, 10 months for 12, read-only with export when unpaid; manual activation and till payments recorded by hand", /14 days of the Business plan free/.test(notes) && /pay 10 months, get 12/.test(notes) && /read-only/.test(notes) && /export/.test(notes) && /by hand, usually the same day/.test(pricing) && (await page.getByTestId("pricing-till-note").count()) === 1);
    await page.getByTestId("audience-switch").getByRole("radio", { name: /Shops/ }).click();
    await page.goto(`${APP}/fr/pricing`);
    const fr = plain(await page.locator("#pricing").innerText());
    ok("in French: 7 500 FCFA, Multi-boutique, « Bientôt disponible »", /7 500 FCFA/.test(fr) && /Multi-boutique/.test(fr) && /Bientôt disponible/.test(fr) && /Bénéfice estimé/.test(fr));
    const phone = await (await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true })).newPage();
    await phone.goto(`${APP}/fr/pricing`);
    ok("on a phone (360 px): no sideways scrolling", await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.goto(`${APP}/en/pricing`);
    await page.locator("#pricing").screenshot({ path: "test-results/plans-pricing.png" });

    // ---------------------------------------------------------------- a new shop: 14-day trial
    await register(page, OWNER);
    const bizId = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${bizId}'`);
    ok("a new shop starts a 14-day free trial of Business, with no AI add-on", sql(`select plan_id || ' ' || status || ' ' || (current_period_end::date - current_date) || ' ' || coalesce(addon_id, '-') from subscriptions where business_id = '${bizId}'`) === "business trialing 14 -");
    await page.goto(`${APP}/en/dashboard`);
    ok("the dashboard says how many trial days are left", /Free trial of Business: 14 days left/.test(await page.getByTestId("trial-banner").innerText()));
    await page.goto(`${APP}/en/dashboard/billing`);
    ok("billing: the trial, no payment needed; the AI assistant coming soon (no add-on to choose)", /Free trial until/.test(await main.getByTestId("billing-state").innerText()) && (await main.getByTestId("ai-coming-soon").count()) === 1 && (await main.getByLabel("AI assistant").count()) === 0);

    // ---------------------------------------------------------------- Boutique: what it leaves out
    sql(`update subscriptions set plan_id = 'boutique', status = 'active', current_period_end = now() + interval '1 month' where business_id = '${bizId}'`);
    sql(`insert into products (business_id, name, price, stock_quantity) values ('${bizId}', 'Robe Ankara', 15000, 5)`);
    await page.goto(`${APP}/en/dashboard/expenses`);
    ok("Boutique: expenses are an upgrade prompt, not an error", /Expenses are in the Business plan/.test(await main.innerText()) && (await main.getByTestId("plan-upsell").count()) === 1 && (await main.getByRole("button", { name: "Add an expense" }).count()) === 0);
    await page.goto(`${APP}/en/dashboard/reports`);
    ok("Boutique: reports are an upgrade prompt", /Reports are in the Business plan/.test(await main.innerText()));
    const csv = await page.request.get(`${APP}/en/dashboard/reports/export?type=sales&from=2026-01-01&to=2030-01-01`);
    ok("…and the server refuses the CSV export", csv.status() === 403, String(csv.status()));
    const robe = sql(`select id from products where business_id = '${bizId}' and name = 'Robe Ankara'`);
    await page.goto(`${APP}/en/dashboard/products/${robe}`);
    ok("Boutique: stock history is an upgrade prompt", /history of every stock change is included from the Business plan/.test(await main.innerText()));
    await page.goto(`${APP}/en/dashboard`);
    ok("Boutique: the dashboard shows no estimated profit", (await main.getByTestId("today-profit").count()) === 0);
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`helper+${stamp}@example.com`);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByTestId("upgrade-prompt").waitFor({ timeout: 10000 });
    ok("Boutique: a second user is refused by the server, shown as an upgrade prompt with “See plans”", sql(`select count(*) from business_invitations where business_id = '${bizId}'`) === "0" && (await main.getByTestId("upgrade-prompt").getByRole("link", { name: /See plans/ }).count()) === 1);

    // ---------------------------------------------------------------- Business: all of it
    sql(`update subscriptions set plan_id = 'business' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard/expenses`);
    ok("Business: expenses", (await main.getByRole("button", { name: "Add an expense" }).count()) === 1 || (await main.getByLabel("Amount (FCFA)").count()) >= 1);
    await page.goto(`${APP}/en/dashboard/reports`);
    ok("Business: reports, with profit labelled estimated", (await main.getByTestId("report-summary").count()) === 1 && /estimated/i.test(await main.innerText()));
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`helper+${stamp}@example.com`);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByRole("textbox", { name: /Invitation link for/ }).waitFor({ timeout: 10000 });
    ok("Business: a second user can be invited (up to 3)", sql(`select count(*) from business_invitations where business_id = '${bizId}'`) === "1");

    // ---------------------------------------------------------------- the trial ending, the grace period: how to pay
    sql(`update subscriptions set plan_id = 'business', status = 'trialing', current_period_end = now() + interval '2 days' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard`);
    ok("trial ending (2 days left): the banner says how to pay in Cameroon (MTN Mobile Money or Orange Money, switched on by the team)", /Pay by MTN Mobile Money or Orange Money/.test(await page.getByTestId("trial-banner").innerText()) && /usually the same day/.test(await page.getByTestId("trial-banner").innerText()));
    sql(`update subscriptions set plan_id = 'business', status = 'active', current_period_end = now() - interval '1 day' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard`);
    const due = await page.getByTestId("billing-banner").innerText();
    ok("grace period (plan ended yesterday): pay by a date to keep it, and how to pay", /Pay by .* to keep it/.test(due) && /Pay by MTN Mobile Money or Orange Money/.test(due), due);
    sql(`update businesses set currency = 'USD' where id = '${bizId}'`);
    await page.goto(`${APP}/fr/dashboard`);
    ok("grace period, a business outside Cameroon (fr): pay by US dollar bank transfer", /virement bancaire en dollars US/.test(await page.getByTestId("billing-banner").innerText()));
    sql(`update businesses set currency = 'XAF' where id = '${bizId}'`);

    // ---------------------------------------------------------------- the trial or plan ended: read-only, data kept
    sql(`update subscriptions set plan_id = 'free', status = 'active' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard`);
    ok("no plan: a clear banner — records safe, choose a plan", /Your records are safe/.test(await page.getByTestId("read-only-banner").innerText()));
    await page.goto(`${APP}/en/dashboard/sales/new`);
    ok("no plan: the till explains instead of selling", (await main.getByTestId("plan-upsell").count()) === 1 && (await main.getByPlaceholder("Search products by name or SKU").count()) === 0);
    await page.goto(`${APP}/en/dashboard/products/new`);
    await main.getByLabel("Name").fill("Pagne");
    await main.getByLabel("Selling price (FCFA)").fill("2000");
    await main.getByRole("button", { name: "Save" }).click();
    await main.getByTestId("upgrade-prompt").waitFor({ timeout: 10000 });
    ok("no plan: saving a product is refused on the server, with an upgrade prompt (not an error)", sql(`select count(*) from products where business_id = '${bizId}' and name = 'Pagne'`) === "0" && /plan has ended/.test(await main.getByTestId("upgrade-prompt").innerText()));
    await page.goto(`${APP}/en/dashboard/products`);
    ok("no plan: the records can still be seen", (await main.getByText("Robe Ankara").count()) >= 1);
    const csvRead = await page.request.get(`${APP}/en/dashboard/reports/export?type=sales&from=2026-01-01&to=2030-01-01`);
    ok("…and exported", csvRead.status() === 200, String(csvRead.status()));

    // ---------------------------------------------------------------- the WazaBolt team: setup fee, trial, payment
    sql(`insert into platform_admins (user_id) select id from auth.users where email = '${OWNER.email}'`);
    await page.goto(`${APP}/en/admin/businesses`);
    const row = page.locator(`tr[data-business-id="${bizId}"]`);
    await row.getByTestId("admin-billing").locator("summary").click();
    await row.getByLabel("Setup fee (0 or 10,000–25,000)").fill("5000");
    await row.getByRole("button", { name: "Save" }).click();
    await page.getByText(/setup fee is 0 \(none\) or between/).waitFor({ timeout: 10000 });
    ok("admin: a setup fee outside 10,000–25,000 is refused", sql(`select setup_fee::int from subscriptions where business_id = '${bizId}'`) === "0");
    await page.locator(`tr[data-business-id="${bizId}"]`).getByTestId("admin-billing").locator("summary").click();
    await page.locator(`tr[data-business-id="${bizId}"]`).getByLabel("Setup fee (0 or 10,000–25,000)").fill("15000");
    await page.locator(`tr[data-business-id="${bizId}"]`).getByRole("button", { name: "Save" }).click();
    await page.getByText(/Setup fee saved/).waitFor({ timeout: 10000 });
    ok("admin: the setup fee is set for this shop", sql(`select setup_fee::int from subscriptions where business_id = '${bizId}'`) === "15000");
    await page.locator(`tr[data-business-id="${bizId}"]`).getByTestId("admin-billing").locator("summary").click();
    await page.locator(`tr[data-business-id="${bizId}"]`).getByLabel("Extend the trial by (days)").fill("7");
    await page.locator(`tr[data-business-id="${bizId}"]`).getByRole("button", { name: "Extend" }).click();
    await page.getByText("Trial extended.").waitFor({ timeout: 10000 });
    ok("admin: extending the trial opens the shop again (7 days of Business)", sql(`select plan_id || ' ' || status || ' ' || (current_period_end::date - current_date) from subscriptions where business_id = '${bizId}'`) === "business trialing 7");
    await page.goto(`${APP}/en/dashboard/billing`);
    ok("billing: the setup fee is shown, paid with the first payment", /15,000 FCFA, paid with your first payment/.test(plain(await main.getByTestId("setup-fee").innerText())));

    await page.goto(`${APP}/en/admin/businesses`);
    const r2 = page.locator(`tr[data-business-id="${bizId}"]`);
    await r2.getByTestId("admin-billing").locator("summary").click();
    await r2.getByLabel("Plan").selectOption("business");
    await r2.getByLabel("Amount received (FCFA)").fill("22500");
    await r2.getByLabel("Reference").fill("MP261103.0915.B777");
    await r2.getByRole("button", { name: "Record payment" }).click();
    await page.getByText(/Payment recorded/).waitFor({ timeout: 10000 });
    ok("admin: a payment entered by hand (MTN MoMo reference) switches the plan on, setup fee included", sql(`select s.plan_id || ' ' || s.status || ' ' || (s.setup_fee_paid_at is not null) || ' ' || p.amount::int || ' ' || p.reference from subscriptions s join subscription_payments p on p.business_id = s.business_id where s.business_id = '${bizId}'`) === "business active true 22500 MP261103.0915.B777");
    await page.goto(`${APP}/en/dashboard/billing`);
    ok("billing: the paid plan and the payment", /Paid until/.test(await main.getByTestId("billing-state").innerText()) && /MP261103\.0915\.B777/.test(await main.innerText()) && /Setup fee paid/.test(await main.getByTestId("setup-fee").innerText()));

    // ---------------------------------------------------------------- launching the AI: the add-on and the Meta notice
    await page.goto(`${APP}/en/admin/businesses`);
    await page.getByRole("button", { name: "Launch the AI assistant" }).click();
    await page.getByText(/The AI assistant is launched/).waitFor({ timeout: 10000 });
    await page.goto(`${APP}/en/dashboard/billing`);
    ok("once launched: Billing offers the AI add-on and the AI trial", (await main.getByLabel("AI assistant").count()) === 1 && (await main.getByText("Start the free AI trial").count()) === 1 && (await main.getByTestId("ai-coming-soon").count()) === 0);
    await main.getByLabel("AI assistant").selectOption("ai_basic");
    await main.getByRole("button", { name: "Send request" }).click();
    await main.getByText(/accept the note about WhatsApp \(Meta\) fees/).first().waitFor({ timeout: 10000 });
    ok("the add-on can't be requested without accepting the WhatsApp (Meta) fees notice", sql(`select count(*) from plan_change_requests where business_id = '${bizId}' and status = 'pending'`) === "0");
    const form = main.locator("#change-plan");
    ok("…the notice says Meta may charge the business directly, separately from WazaBolt", /WhatsApp \(Meta\) may charge my business directly for some messages\. These fees are separate from WazaBolt\./.test(await form.innerText()));
    await form.getByText(/I understand: WhatsApp \(Meta\) may charge/).click();
    await form.getByRole("button", { name: "Send request" }).click();
    await main.getByTestId("pending-request").waitFor({ timeout: 10000 });
    ok("accepted: the request is Business + AI Basic, and the acceptance is stored", /Business \+ AI Basic/.test(await main.getByTestId("pending-request").innerText()) && sql(`select meta_notice_accepted_at is not null from subscriptions where business_id = '${bizId}'`) === "t");
    await page.goto(`${APP}/en/admin/plan-requests`);
    ok("admin: the request's amount is the bundle price (11,500 FCFA)", /11,500 FCFA/.test(plain(await page.locator("main").innerText())));
    await page.goto(`${APP}/en/admin/businesses`);
    await page.getByRole("button", { name: "Back to coming soon" }).click();
    await page.getByText(/back to “coming soon”/).waitFor({ timeout: 10000 });
    ok("back to coming soon from admin", sql(`select public.ai_assistant_launched()`) === "f");
    await page.goto(`${APP}/en/dashboard/billing`);
    await page.screenshot({ path: "test-results/plans-billing.png", fullPage: true });

    ok("no browser errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    sql(`select public.admin_set_ai_launched(false); delete from platform_admins where user_id in (select id from auth.users where email = '${OWNER.email}')`);
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
