/*
 * End-to-end test of branches: an owner on the Business plan opens a second
 * branch (2 locations included), asks for an extra branch (5,000 FCFA/month,
 * approved by WazaBolt), moves stock to the new branch, switches to it in the
 * header and sells there from the till (stock leaves that branch only); a
 * cashier tied to the new branch only sees its sales; reports split by
 * branch; a Free shop can't open a branch. Against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:branches
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { startFakeResend } from "./fake-resend.mjs";

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
  await page.waitForURL(/\/dashboard\/onboarding/, { timeout: 15000 });
}

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  // The app's own emails (to the WazaBolt team) go through Resend: this records them.
  const resend = await startFakeResend(4030);
  const errors = [];
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    return page;
  };

  try {
    const page = await newPage();
    const main = page.locator("main");
    const OWNER = { name: "Awa Fon", business: "Awa Styles", email: `branches-owner+${stamp}@example.com`, password: "Wazabolt2026" };
    await register(page, OWNER);
    const bizId = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    const mainBranch = sql(`select id from branches where business_id = '${bizId}' and is_main`);

    // ---------------------------------------------------------------- Free: one location
    await page.goto(`${APP}/en/dashboard/branches`);
    await main.getByTestId("branch-allowance").waitFor({ timeout: 15000 });
    ok("a new business has its main branch; Free includes one location", /1 of 1 locations open on the Free plan/.test(await main.getByTestId("branch-allowance").innerText()) && (await main.getByTestId("branch-limit").count()) === 1);
    ok("…and no header branch switcher with one branch", (await page.getByTestId("branch-switcher").count()) === 0);

    // ---------------------------------------------------------------- Business: two locations
    sql(`update subscriptions set plan_id = 'business' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard/branches`);
    await main.getByTestId("branch-allowance").getByText(/1 of 2 locations/).waitFor({ timeout: 15000 });
    const add = main.locator("#new-branch");
    await add.getByLabel("Branch name").fill("Bonamoussadi");
    await add.getByLabel("Address").fill("Carrefour Kotto");
    await add.getByLabel("City").fill("Douala");
    await add.getByLabel("Opening hours").fill("Mon–Sat 8:00–20:00");
    await add.getByRole("button", { name: "Open the branch" }).click();
    await main.getByTestId("branch-allowance").getByText(/2 of 2 locations/).waitFor({ timeout: 15000 });
    const b2 = sql(`select id from branches where business_id = '${bizId}' and name = 'Bonamoussadi'`);
    ok("the owner opens a second branch on Business (2 locations included)", !!b2 && sql(`select address || ' ' || hours from branches where id = '${b2}'`) === "Carrefour Kotto Mon–Sat 8:00–20:00");
    ok("…the third location needs an extra branch", (await main.getByTestId("branch-limit").count()) === 1);
    ok("…and the header now shows the branch switcher", (await page.getByTestId("branch-switcher").count()) === 1);

    // ---------------------------------------------------------------- An extra branch, approved by WazaBolt
    await main.getByLabel("Extra branches you want in total").fill("1");
    await main.getByRole("button", { name: "Request" }).click();
    await main.getByText("Request sent.").waitFor({ timeout: 15000 });
    const req = sql(`select id || ' ' || kind || ' ' || extra_branches from plan_change_requests where business_id = '${bizId}' and status = 'pending'`);
    ok("asking for an extra branch files a request for WazaBolt (kind branches, 1 extra)", / branches 1$/.test(req), req);
    let teamMail;
    for (let i = 0; i < 20 && !teamMail; i++, await sleep(500)) teamMail = resend.emails.find((e) => e.to.includes("contact@wazabolt.com") && /Extra branches – Awa Styles: 1/.test(e.subject));
    ok("…and the WazaBolt team is emailed: 1 extra branch at 5,000 FCFA/month", !!teamMail && /5,000 FCFA\/month/.test(teamMail.html), teamMail?.subject);
    sql(`select approve_plan_change('${req.split(" ")[0]}', 5000, 'mobile_money', 'MP-BR-1')`);
    await page.goto(`${APP}/en/dashboard/branches`);
    await main.getByTestId("branch-allowance").getByText(/2 of 3 locations/).waitFor({ timeout: 15000 });
    ok("once approved: 3 locations, the add form is back", (await main.locator("#new-branch").getByRole("button", { name: "Open the branch" }).count()) === 1);
    await page.screenshot({ path: "test-results/branches-page.png", fullPage: true });

    // ---------------------------------------------------------------- Stock per branch
    sql(`insert into products (business_id, name, price, stock_quantity) values ('${bizId}', 'Robe Ankara', 15000, 10)`);
    const productId = sql(`select id from products where business_id = '${bizId}' and name = 'Robe Ankara'`);
    const qty = (branch) => Number(sql(`select coalesce((select quantity from branch_stock where branch_id = '${branch}' and product_id = '${productId}'), 0)`));
    await page.goto(`${APP}/en/dashboard/products/${productId}`);
    await main.getByTestId("stock-by-branch").waitFor({ timeout: 15000 });
    ok("a product's stock is shown per branch (opening stock in the main branch)", /Awa Styles\s*10/.test(await main.getByTestId("stock-by-branch").innerText()) && qty(mainBranch) === 10);
    const transfer = main.locator("#transfer-stock");
    await transfer.getByLabel("To").selectOption(b2);
    await transfer.getByLabel("Quantity").fill("4");
    await transfer.getByRole("button", { name: "Move stock" }).click();
    await transfer.getByText("Stock moved.").waitFor({ timeout: 15000 });
    ok("moving 4 to Bonamoussadi: 6 + 4, the total stays 10", qty(mainBranch) === 6 && qty(b2) === 4 && sql(`select stock_quantity from products where id = '${productId}'`) === "10");
    ok("…logged as two transfer movements", sql(`select count(*) from stock_movements where product_id = '${productId}' and reason = 'transfer'`) === "2");

    // ---------------------------------------------------------------- Selling in the second branch
    await page.getByTestId("branch-switcher").locator("select").selectOption(b2);
    // The switch is saved by a server action (a cookie): wait for it before leaving the page.
    for (let i = 0; i < 40 && !(await page.context().cookies()).some((c) => c.name === "wb_branch" && c.value === b2); i++) await sleep(250);
    await page.goto(`${APP}/en/dashboard/sales/new`);
    await main.getByPlaceholder("Search products by name or SKU").waitFor({ timeout: 15000 });
    await main.getByText("Branch: Bonamoussadi").waitFor({ timeout: 15000 }).catch(() => {});
    ok("the till says which branch it sells for", (await main.getByText("Branch: Bonamoussadi").count()) === 1);
    for (let i = 0; i < 3; i++) await main.getByRole("button", { name: /^Robe Ankara —/ }).click();
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}\?new=1/, { timeout: 15000 });
    const saleId = page.url().split("/").pop().split("?")[0];
    ok("a sale in Bonamoussadi is recorded there and takes its stock only (4 → 1; main still 6)", sql(`select branch_id from orders where id = '${saleId}'`) === b2 && qty(b2) === 1 && qty(mainBranch) === 6);
    ok("…the product list shows this branch's stock under the total", await (async () => {
      await page.goto(`${APP}/en/dashboard/products`);
      await main.getByTestId("branch-stock").first().waitFor({ timeout: 15000 });
      return (await main.getByTestId("branch-stock").first().innerText()) === "Bonamoussadi: 1";
    })());

    // ---------------------------------------------------------------- A cashier tied to Bonamoussadi
    sql(`insert into orders (business_id, order_number, status, branch_id) values ('${bizId}', 'MAIN-1', 'pending', '${mainBranch}')`);
    const cp = await newPage();
    const cashier = { name: "Paul Cashier", business: "Temp", email: `branches-cashier+${stamp}@example.com`, password: "Wazabolt2026" };
    await register(cp, cashier);
    sql(`with u as (select id from auth.users where email = '${cashier.email}')
         , gone as (delete from business_members where user_id = (select id from u) returning 1)
         insert into business_members (business_id, user_id, role) select '${bizId}', id, 'agent' from u`);
    const cashierId = sql(`select id from auth.users where email = '${cashier.email}'`);
    await page.goto(`${APP}/en/dashboard/team`);
    const branchSelect = main.getByLabel("Branch: Paul Cashier");
    await branchSelect.waitFor({ timeout: 15000 });
    await branchSelect.selectOption(b2);
    for (let i = 0; i < 30 && sql(`select coalesce(branch_id::text, '') from business_members where user_id = '${cashierId}'`) !== b2; i++) await sleep(300);
    ok("the owner ties the cashier to Bonamoussadi on the Team page", sql(`select branch_id from business_members where user_id = '${cashierId}'`) === b2);
    await cp.goto(`${APP}/en/dashboard/orders`);
    await cp.getByTestId("branch-name").waitFor({ timeout: 15000 });
    const cashierOrders = await cp.locator("main").innerText();
    ok("the cashier works in Bonamoussadi (no switcher) and only sees its orders", (await cp.getByTestId("branch-switcher").count()) === 0 && !cashierOrders.includes("MAIN-1") && cashierOrders.includes(sql(`select order_number from orders where id = '${saleId}'`)));
    await cp.goto(`${APP}/en/dashboard/sales/new`);
    await cp.locator("main").getByText("Branch: Bonamoussadi").waitFor({ timeout: 15000 });
    ok("…and their till sells for Bonamoussadi", true);

    // ---------------------------------------------------------------- Reports per branch
    await page.goto(`${APP}/en/dashboard/reports?range=custom&from=2026-01-01&to=2030-01-01&branch=${mainBranch}`);
    await main.getByTestId("report-summary").waitFor({ timeout: 15000 });
    const mainReport = await main.getByTestId("report-summary").innerText();
    await page.goto(`${APP}/en/dashboard/reports?range=custom&from=2026-01-01&to=2030-01-01&branch=${b2}`);
    await main.getByTestId("report-summary").waitFor({ timeout: 15000 });
    const b2Report = await main.getByTestId("report-summary").innerText();
    ok("reports can show one branch: Bonamoussadi has the 45,000 FCFA sale, the main branch none", /45,000 FCFA/.test(b2Report) && !/45,000 FCFA/.test(mainReport), `${b2Report.slice(0, 80)} | ${mainReport.slice(0, 80)}`);

    // ---------------------------------------------------------------- Downgrade pauses the newest branch
    sql(`update subscriptions set plan_id = 'starter' where business_id = '${bizId}'`);
    ok("moving to Starter (1 location) pauses Bonamoussadi; its stock is kept", sql(`select active from branches where id = '${b2}'`) === "f" && qty(b2) === 1);
    await page.goto(`${APP}/en/dashboard/branches`);
    await main.getByTestId("branch-allowance").waitFor({ timeout: 15000 });
    ok("…and the Branches page shows it paused", /paused/i.test(await main.getByTestId("branch-list").innerText()));

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    resend.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
