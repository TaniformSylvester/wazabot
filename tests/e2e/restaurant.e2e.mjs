/*
 * End-to-end test of WazaBolt Restaurants: a restaurant's menu, tables, a dish
 * with priced extras, an open bill on a table with rounds sent to the
 * kitchen, a Kitchen account that sees only the kitchen screen, removing a
 * dish, split payments, closing the bill (table free again), a takeaway
 * order, the printable bill, French and phones — against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:restaurant
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
const until = async (fn, ms = 10000) => {
  for (let i = 0; i < ms / 250; i++) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
};

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
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
  const open = async (path) => {
    await page.goto(`${APP}${path}`);
    await settle();
  };

  try {
    // ---------------------------------------------------------------- A restaurant signs up
    const OWNER = { name: "Mama Ngozi", business: "Chez Mama Ngozi", email: `resto-owner+${stamp}@example.com`, password: "Wazabolt2026" };
    const COOK = { name: "Paul Cuisinier", email: `resto-cook+${stamp}@example.com`, password: "Wazabolt2026" };
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
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now(), free_limits_from = '2099-12-31', industry = 'restaurant', default_language = 'en' where id = '${biz}'`);

    await open(`/en/dashboard`);
    ok("a restaurant's menu has the floor, the kitchen and tables (module on by default)", (await nav.getByRole("link", { name: "Floor and bills" }).count()) === 1 && (await nav.getByRole("link", { name: "Kitchen" }).count()) === 1 && (await nav.getByRole("link", { name: "Tables" }).count()) === 1);

    // ---------------------------------------------------------------- Tables
    await open(`/en/dashboard/restaurant`);
    ok("no tables yet: the floor says so and links to Tables", (await main.getByText("No tables yet.").count()) === 1);
    await open(`/en/dashboard/restaurant/tables`);
    const addTable = async (name, area, seats) => {
      const form = main.locator("form").first();
      await form.getByLabel("Name").fill(name);
      if (area) await form.getByLabel("Area (optional)").fill(area);
      if (seats) await form.getByLabel("Seats (optional)").fill(seats);
      await form.getByRole("button", { name: "Add the table" }).click();
      await until(() => sql(`select count(*) from restaurant_tables where business_id = '${biz}' and name = '${name}'`) === "1");
    };
    await addTable("T1", "Terrasse", "4");
    await addTable("T2", "", "2");
    await settle();
    const form = main.locator("form").first();
    await form.getByLabel("Name").fill("t1");
    await form.getByRole("button", { name: "Add the table" }).click();
    await main.getByText("This already exists", { exact: false }).first().waitFor({ timeout: 5000 }).catch(() => {});
    ok("owners add tables (area, seats); the same name twice is refused", sql(`select string_agg(name || ':' || coalesce(area, '-') || ':' || coalesce(seats::text, '-'), ',' order by name) from restaurant_tables where business_id = '${biz}'`) === "T1:Terrasse:4,T2:-:2");

    // ---------------------------------------------------------------- A dish with priced extras (product form)
    await open(`/en/dashboard/products/new`);
    await main.getByLabel("Name").fill("Poulet DG");
    await main.getByLabel(/Selling price/).fill("5000");
    await main.getByLabel("Category").fill("Plats");
    const extras = main.getByTestId("extras-editor");
    await extras.getByRole("button", { name: "Add an extra" }).click();
    await extras.getByLabel("Extra 1").fill("Plantain frit");
    await extras.getByLabel("Price 1").fill("500");
    await extras.getByRole("button", { name: "Add an extra" }).click();
    await extras.getByLabel("Extra 2").fill("Piment");
    await extras.getByLabel("Price 2").fill("0");
    await main.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/dashboard\/products\/[0-9a-f-]{36}\?saved=1/);
    ok("a dish is saved with its priced extras", sql(`select extras::text from products where business_id = '${biz}' and name = 'Poulet DG'`) === '[{"name": "Plantain frit", "price": 500}, {"name": "Piment", "price": 0}]');
    sql(`insert into products (business_id, name, price, category, stock_quantity) values ('${biz}', 'Jus de bissap', 1000, 'Boissons', 10)`);

    // ---------------------------------------------------------------- An open bill on T1
    await open(`/en/dashboard/restaurant`);
    const t1 = main.getByTestId("floor-table").filter({ hasText: "T1" });
    await t1.getByLabel("Guests").fill("3");
    await t1.getByRole("button", { name: "Open a bill" }).click();
    await page.waitForURL(/\/dashboard\/restaurant\/orders\/[0-9a-f-]{36}/, { timeout: 15000 });
    const billUrl = page.url();
    const billId = billUrl.split("/").at(-1);
    await settle();
    ok("opening a bill on T1 takes the waiter to it", (await main.getByRole("heading", { name: /^Table T1 · ORD-/ }).count()) === 1);

    const picker = main.getByTestId("menu-picker");
    await picker.getByRole("button", { name: /Poulet DG/ }).click();
    const editor = picker.getByTestId("dish-editor");
    await editor.getByLabel("Plantain frit").check();
    await editor.getByRole("button", { name: "+" }).click();
    await editor.getByLabel(/Note for the kitchen/).fill("sans oignons");
    await editor.getByRole("button", { name: /^Add · / }).click();
    await picker.getByRole("button", { name: /Jus de bissap/ }).click();
    await picker.getByTestId("dish-editor").getByRole("button", { name: /^Add · / }).click();
    ok("the picker prices extras and quantities before sending (2 × 5,500 + 1,000)", /12,000/.test(await picker.getByTestId("picker-total").innerText()));
    await main.getByRole("button", { name: "Add and send to the kitchen" }).click();
    await until(() => sql(`select count(*) from kitchen_tickets where order_id = '${billId}'`) === "1");
    await settle();
    ok(
      "round 1 goes to the kitchen: lines with extras and the note, priced by the database",
      sql(`select total::int from orders where id = '${billId}'`) === "12000" &&
        sql(`select string_agg(product_name || ':' || quantity || ':' || unit_price::int || ':' || coalesce(note, '-'), ',' order by product_name) from order_items where order_id = '${billId}'`) === "Jus de bissap:1:1000:-,Poulet DG:2:5500:sans oignons" &&
        (await main.getByTestId("bill-round").count()) === 1,
    );

    // ---------------------------------------------------------------- The cook (a free kitchen seat, even with Free limits in force)
    sql(`update businesses set free_limits_from = current_date where id = '${biz}'`);
    await open(`/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(COOK.email);
    await main.getByLabel("Role", { exact: true }).selectOption("kitchen");
    await main.getByRole("button", { name: "Create invitation link" }).click();
    const linkBox = main.getByRole("textbox", { name: `Invitation link for ${COOK.email}` });
    await linkBox.waitFor({ timeout: 10000 });
    const cookLink = await linkBox.inputValue();
    const kctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const kp = await kctx.newPage();
    kp.on("pageerror", (e) => errors.push(String(e)));
    kp.on("dialog", (d) => d.accept());
    const kmain = kp.locator("main");
    await kp.goto(cookLink);
    await kp.getByLabel("Your name").fill(COOK.name);
    await kp.getByLabel("Password", { exact: true }).fill(COOK.password);
    await kp.getByRole("button", { name: "Create account and join" }).click();
    await kp.getByText(/open the confirmation email we sent you/).waitFor({ timeout: 10000 });
    await kp.goto(linkFrom(await latestMail(COOK.email, "Confirm")));
    await kp.waitForURL(/\/dashboard\/restaurant\/kitchen/, { timeout: 15000 });
    await kp.waitForLoadState("networkidle").catch(() => {});
    const ticket = kmain.getByTestId("kitchen-ticket").first();
    const ticketText = await ticket.innerText();
    await open(`/en/dashboard/team`);
    const seats = (await main.getByTestId("team-seats").innerText()).replace(/\s+/g, " ");
    ok("kitchen accounts are free seats: on Free (1 user, in force) the cook joins; Team shows users 1 of 1 and kitchen 1 of 10", /Users 1 of 1/.test(seats) && /Kitchen accounts 1 of 10/.test(seats), seats);
    sql(`update businesses set free_limits_from = '2099-12-31' where id = '${biz}'`);
    ok("the cook joins with the Kitchen role and lands on the kitchen screen", sql(`select m.role from business_members m join auth.users u on u.id = m.user_id where u.email = '${COOK.email}' and m.business_id = '${biz}'`) === "kitchen");
    ok("the ticket shows the table, dishes, extras and the note — no prices", /Table T1/.test(ticketText) && /2 × Poulet DG/.test(ticketText) && /\+ Plantain frit/.test(ticketText) && /sans oignons/.test(ticketText) && !/5,500|12,000|XAF|FCFA/.test(ticketText), ticketText.replace(/\s+/g, " "));
    await kp.goto(`${APP}/en/dashboard/orders`);
    await kp.waitForURL(/\/dashboard\/restaurant\/kitchen/, { timeout: 10000 });
    const knav = kp.locator("aside nav").first();
    ok("the cook opening other pages is sent back to the kitchen; the menu only has Kitchen and Team", (await knav.getByRole("link", { name: "Kitchen" }).count()) === 1 && (await knav.getByRole("link", { name: "Orders" }).count()) === 0 && (await knav.getByRole("link", { name: "Floor and bills" }).count()) === 0);
    await ticket.getByRole("button", { name: "Start" }).click();
    await until(() => sql(`select status from kitchen_tickets where order_id = '${billId}'`) === "preparing");
    await kp.reload();
    await kmain.getByTestId("kitchen-ticket").first().getByRole("button", { name: "Ready" }).click();
    ok("the cook moves the ticket: preparing, then ready", await until(() => sql(`select status from kitchen_tickets where order_id = '${billId}'`) === "ready"));

    // ---------------------------------------------------------------- Round 2, a removed dish, payments, closing
    await page.goto(billUrl);
    await settle();
    await picker.getByRole("button", { name: /Jus de bissap/ }).click();
    await picker.getByTestId("dish-editor").getByRole("button", { name: /^Add · / }).click();
    await main.getByRole("button", { name: "Add and send to the kitchen" }).click();
    await until(() => sql(`select count(*) from kitchen_tickets where order_id = '${billId}'`) === "2");
    await settle();
    ok("round 2 becomes a second ticket; the first shows Ready", (await main.getByTestId("bill-round").count()) === 2 && /Ready/.test(await main.getByTestId("bill-round").first().innerText()));
    const round2 = main.getByTestId("bill-round").nth(1);
    await round2.getByText("Remove", { exact: true }).click();
    await round2.getByLabel("Why remove it?").fill("Le client a changé d'avis");
    await round2.getByRole("button", { name: "Remove the dish" }).click();
    ok("a dish not started yet is removed (total back to 12,000, stock returned)", await until(() => sql(`select total::int from orders where id = '${billId}'`) === "12000" && sql(`select stock_quantity from products where business_id = '${biz}' and name = 'Jus de bissap'`) === "9"));
    await page.reload();
    await settle();
    await main.getByRole("button", { name: "Close the bill" }).click();
    await main.getByText("The bill isn't paid in full yet", { exact: false }).waitFor({ timeout: 10000 }).catch(() => {});
    ok("an unpaid bill can't be closed", (await main.getByText("The bill isn't paid in full yet", { exact: false }).count()) === 1 && sql(`select bill_closed_at is null from orders where id = '${billId}'`) === "t");
    const pay = async (amount, method) => {
      const f = main.getByTestId("record-payment");
      await f.getByLabel(/Amount received/).fill(String(amount));
      await f.getByLabel("Paid by").selectOption(method);
      const before = sql(`select amount_paid::int from orders where id = '${billId}'`);
      await f.getByRole("button", { name: "Record payment" }).click();
      // The form goes away once the bill is paid in full: wait on the database.
      await until(() => sql(`select amount_paid::int from orders where id = '${billId}'`) !== before);
      await page.reload();
      await settle();
    };
    await pay(7000, "cash");
    await pay(5000, "mtn_momo");
    ok("two guests pay their share (split bill): balance 0", /^0 /.test((await main.getByTestId("bill-balance").innerText()).trim()));
    await main.getByRole("button", { name: "Close the bill" }).click();
    ok("the paid bill closes; the order is complete", await until(() => sql(`select status || ':' || (bill_closed_at is not null) from orders where id = '${billId}'`) === "delivered:true"));
    await open(`/en/dashboard/restaurant`);
    ok("T1 is free again on the floor", /Free/.test(await main.getByTestId("floor-table").filter({ hasText: "T1" }).innerText()));
    await page.goto(`${APP}/en/dashboard/orders/${billId}/document?type=invoice`);
    await settle();
    ok("the printable bill lists the extras and the note", /\+ Plantain frit/.test(await main.getByTestId("document-items").innerText()) && /sans oignons/.test(await main.getByTestId("document-items").innerText()));

    // ---------------------------------------------------------------- Takeaway
    await open(`/en/dashboard/restaurant`);
    await main.getByTestId("new-takeaway").click();
    await page.waitForURL(/\/restaurant\/new\?type=takeaway/);
    await settle();
    await main.getByRole("button", { name: "Create the order and send it to the kitchen" }).click();
    await main.getByText("Add at least one dish.").waitFor({ timeout: 10000 }).catch(() => {});
    ok("a takeaway order needs at least one dish", (await main.getByText("Add at least one dish.").count()) === 1);
    await main.getByTestId("menu-picker").getByRole("button", { name: /Poulet DG/ }).click();
    await main.getByTestId("dish-editor").getByLabel("Piment").check();
    await main.getByTestId("dish-editor").getByRole("button", { name: /^Add · / }).click();
    await main.getByRole("button", { name: "Create the order and send it to the kitchen" }).click();
    await page.waitForURL(/\/dashboard\/restaurant\/orders\/[0-9a-f-]{36}/, { timeout: 15000 });
    const takeawayId = page.url().split("/").at(-1);
    ok("the takeaway order is created and sent to the kitchen", sql(`select service_type || ':' || status || ':' || total::int from orders where id = '${takeawayId}'`) === "takeaway:processing:5000" && sql(`select count(*) from kitchen_tickets where order_id = '${takeawayId}'`) === "1");
    await kp.reload();
    await kp.waitForLoadState("networkidle").catch(() => {});
    const tk = kmain.getByTestId("kitchen-ticket").filter({ hasText: "Takeaway" });
    await tk.getByRole("button", { name: "Start" }).click();
    await until(() => sql(`select status from kitchen_tickets where order_id = '${takeawayId}'`) === "preparing");
    await kp.reload();
    await kmain.getByTestId("kitchen-ticket").filter({ hasText: "Takeaway" }).getByRole("button", { name: "Ready" }).click();
    ok("when the kitchen marks it ready, the takeaway order is ready", await until(() => sql(`select status from orders where id = '${takeawayId}'`) === "ready"));
    await open(`/en/dashboard/restaurant`);
    ok("the floor lists the takeaway order as ready", /Takeaway/.test(await main.getByTestId("floor-orders").innerText()) && /Ready/.test(await main.getByTestId("floor-orders").innerText()));
    await kp.screenshot({ path: "test-results/restaurant-kitchen.png", fullPage: true });
    await kctx.close();

    // ---------------------------------------------------------------- French, phones
    await open(`/fr/dashboard/restaurant`);
    ok("the floor in French", (await main.getByRole("heading", { name: "Salle et additions", exact: true }).count()) === 1 && /Libre/.test(await main.getByTestId("floor-tables").innerText()));
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const m = await phone.newPage();
    for (const p of [`/en/dashboard/restaurant`, `/en/dashboard/restaurant/orders/${billId}`, `/en/dashboard/restaurant/kitchen`, `/en/dashboard/restaurant/tables`, `/en/dashboard/restaurant/new?type=delivery`]) {
      await m.goto(`${APP}${p}`);
      await sleep(600);
      ok(`fits a 390 px phone: ${p.replace("/en/dashboard/", "")}`, (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    }
    await phone.close();
    await page.goto(billUrl);
    await settle();
    await page.screenshot({ path: "test-results/restaurant-bill.png", fullPage: true });

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
    await page.screenshot({ path: "test-results/restaurant-failure.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
