/*
 * End-to-end test of WazaBolt V2 (POS + inventory + customers/credit +
 * expenses + dashboard + reports) against a local Supabase stack: the
 * acceptance workflow of a fictional Cameroon business, through the UI,
 * checked against the database.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:pos
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
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
  const OWNER = { name: "Marie Josée", business: "MJ Fashion Cameroon", email: `pos-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  try {
    await register(page, OWNER);
    const bizId = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${bizId}'`);
    const stockOf = (name) => Number(sql(`select stock_quantity from products where business_id = '${bizId}' and name = '${name}'`));

    // ---------------------------------------------------------------- Test 1: create products
    const createProduct = async (p) => {
      await page.goto(`${APP}/en/dashboard/products/new`);
      await main.getByLabel("Name").fill(p.name);
      await main.getByLabel("Selling price (FCFA)").fill(p.price);
      await main.getByLabel("Cost price (FCFA)").fill(p.cost);
      await main.getByLabel("Opening stock").fill(p.stock);
      await main.getByLabel("Minimum stock level").fill(p.min);
      await main.getByLabel("Category").fill("Clothing");
      await main.getByRole("button", { name: "Save" }).click();
      await page.waitForURL(/\/dashboard\/products\/[0-9a-f-]{36}\?saved=1/);
    };
    await createProduct({ name: "T-Shirt", price: "8 000", cost: "4 500", stock: "10", min: "3" });
    await createProduct({ name: "Jeans", price: "18000", cost: "11000", stock: "4", min: "3" });
    ok("Test 1 — products created with selling price, cost price and opening stock", sql(`select string_agg(name || ':' || price::int || ':' || cost_price::int || ':' || stock_quantity, ',' order by name) from products where business_id = '${bizId}'`) === "Jeans:18000:11000:4,T-Shirt:8000:4500:10");

    // ---------------------------------------------------------------- Test 2: add stock
    await page.goto(`${APP}/en/dashboard/products?q=T-Shirt`);
    await main.getByRole("link", { name: /T-Shirt/ }).first().click();
    await main.getByTestId("stock-level").waitFor({ timeout: 10000 });
    await main.getByLabel("Reason").selectOption("purchase");
    await main.getByLabel("Quantity", { exact: true }).fill("5");
    await main.getByLabel("Note (optional)").fill("Supplier delivery");
    await main.getByRole("button", { name: "Update stock" }).click();
    await main.getByText("Stock updated.").waitFor({ timeout: 10000 });
    ok("Test 2 — stock added as a purchase: 10 + 5 = 15, recorded with its reason", stockOf("T-Shirt") === 15 && sql(`select string_agg(reason || ' ' || quantity_change, ',' order by created_at) from stock_movements where business_id = '${bizId}' and product_id = (select id from products where business_id = '${bizId}' and name = 'T-Shirt')`) === "opening 10,purchase 5");

    // ---------------------------------------------------------------- Test 3: create customer
    await page.goto(`${APP}/en/dashboard/customers/new`);
    await main.getByLabel("Name").fill("John Paul");
    await main.getByLabel("WhatsApp number").fill("+237 670 11 22 33");
    await main.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/dashboard\/customers\/[0-9a-f-]{36}/);
    const customerId = sql(`select id from customers where business_id = '${bizId}' and name = 'John Paul'`);
    ok("Test 3 — customer created", !!customerId);

    // ---------------------------------------------------------------- Test 4: cash sale
    const pos = async () => {
      await page.goto(`${APP}/en/dashboard/sales/new`);
      await main.getByPlaceholder("Search products by name or SKU").waitFor({ timeout: 15000 });
    };
    const addProduct = (name, times = 1) => Array.from({ length: times }).reduce((p) => p.then(() => main.getByRole("button", { name: new RegExp(`^${name} —`) }).click()), Promise.resolve());
    await pos();
    await addProduct("T-Shirt", 2);
    await main.getByLabel("Customer", { exact: true }).selectOption({ label: "John Paul" });
    ok("POS: running total from the catalog price", (await main.getByTestId("pos-total").innerText()) === "16,000 FCFA", await main.getByTestId("pos-total").innerText());
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}\?new=1/);
    const cashSale = page.url().split("/").pop().split("?")[0];
    const receipt = await main.getByTestId("receipt").innerText();
    ok(
      "Test 4 — cash sale: sale created, receipt generated, stock reduced (15 → 13), payment recorded",
      /MJ FASHION CAMEROON/.test(receipt) && /ORD-00001/.test(receipt) && /16,000 FCFA/.test(receipt) && /Cash/.test(receipt) && /PAID/.test(receipt) && /John Paul/.test(receipt) && stockOf("T-Shirt") === 13 &&
        sql(`select status || ' ' || channel || ' ' || payment_status from orders where id = '${cashSale}'`) === "delivered pos paid",
      receipt.replace(/\n/g, " | "),
    );
    ok("cash sale: stock movement recorded as a sale linked to the receipt", sql(`select reason || ' ' || quantity_change from stock_movements where order_id = '${cashSale}'`) === "sale -2");
    ok("cash sale: estimated profit shown to the owner (16,000 − 2 × 4,500 = 7,000)", (await main.getByTestId("sale-profit").innerText()) === "7,000 FCFA");
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: "test-results/v2-receipt-print.png", fullPage: true });
    ok("receipt prints without the dashboard around it", !(await page.locator("aside").first().isVisible()) && (await main.getByTestId("receipt").isVisible()));
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({ path: "test-results/v2-sale.png", fullPage: true });

    // ---------------------------------------------------------------- Test 5: MTN MoMo sale (walk-in), double tap
    await pos();
    await addProduct("Jeans");
    await main.getByLabel("Payment method").selectOption("mtn_momo");
    await main.getByLabel("Reference (MoMo, bank)").fill("MP261007.1432.C55");
    const before = Number(sql(`select count(*) from orders where business_id = '${bizId}'`));
    await main.getByRole("button", { name: /Complete sale/ }).dblclick();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}\?new=1/);
    const momoSale = page.url().split("/").pop().split("?")[0];
    ok("Test 5 — MTN MoMo sale: method and reference recorded", sql(`select method || ' ' || reference from order_payments where order_id = '${momoSale}'`) === "mtn_momo MP261007.1432.C55");
    ok("a double tap on Complete sale records one sale", Number(sql(`select count(*) from orders where business_id = '${bizId}'`)) === before + 1 && stockOf("Jeans") === 3);

    // ---------------------------------------------------------------- Test 6: credit sale with a part payment
    await pos();
    await addProduct("T-Shirt", 3);
    await main.getByLabel("Payment method").selectOption("cash");
    await main.getByLabel("Amount paid now").fill("10000");
    ok("POS: what isn't paid now is shown as credit", (await main.getByTestId("pos-credit").innerText()).includes("14,000 FCFA"));
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await main.getByRole("alert").getByText("Choose or add a customer for a sale on credit.").waitFor({ timeout: 5000 });
    ok("a sale on credit needs a customer", true);
    await main.getByLabel("Customer", { exact: true }).selectOption({ label: "John Paul" });
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}\?new=1/);
    const creditSale = page.url().split("/").pop().split("?")[0];
    ok(
      "Test 6 — credit sale: recorded, part payment recorded, balance 14,000",
      sql(`select payment_status || ' ' || total::int || ' ' || amount_paid::int from orders where id = '${creditSale}'`) === "partial 24000 10000" && /Balance due: 14,000 FCFA/.test(await main.getByTestId("balance-due").innerText()),
    );
    ok("customer balance follows the sale", sql(`select outstanding::int from customer_stats where customer_id = '${customerId}'`) === "14000");

    // A new customer typed at the till.
    await pos();
    await addProduct("T-Shirt");
    await main.getByLabel("Customer", { exact: true }).selectOption("new");
    await main.getByLabel("Customer name").fill("Aïcha Bello");
    await main.getByLabel("Phone / WhatsApp").fill("677 44 55 66");
    await main.getByLabel("Payment method").selectOption("credit");
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}\?new=1/);
    ok("POS: a new customer added at the till, sale fully on credit", sql(`select c.name || ' ' || c.whatsapp_phone || ' ' || o.payment_method || ' ' || o.payment_status from orders o join customers c on c.id = o.customer_id where o.id = '${page.url().split("/").pop().split("?")[0]}'`) === "Aïcha Bello 237677445566 credit unpaid");

    // Stock can't be oversold from the POS.
    await pos();
    await addProduct("Jeans", 5);
    ok("POS: can't add more than the stock", (await main.getByLabel("Jeans: 3").count()) === 1 && (await main.getByRole("button", { name: "One more: Jeans" }).isDisabled()));

    // ---------------------------------------------------------------- sales history
    await page.goto(`${APP}/en/dashboard/sales`);
    const history = await main.locator("table").innerText();
    ok("sales history: every sale with customer, payment, status and profit", ["ORD-00001", "ORD-00002", "ORD-00003", "ORD-00004", "John Paul", "Walk-in customer", "MTN MoMo", "Part paid"].every((x) => history.includes(x)), history.slice(0, 300));
    await page.goto(`${APP}/en/dashboard/sales?method=mtn_momo`);
    ok("sales history: filter by payment method", (await main.locator("tbody tr").count()) === 1);
    await page.screenshot({ path: "test-results/v2-sales.png", fullPage: true });

    // ---------------------------------------------------------------- Test 7: customer credit payment
    await page.goto(`${APP}/en/dashboard/customers?balance=1`);
    const owing = await main.locator("table").innerText();
    ok("customers: totals per customer, and a filter for those who owe", (await main.locator("tbody tr").count()) === 2 && /John Paul/.test(owing) && /40,000 FCFA/.test(owing) && /14,000 FCFA/.test(owing) && /Aïcha Bello/.test(owing), owing.replace(/\n/g, " | ").slice(0, 300));
    await page.goto(`${APP}/en/dashboard/customers/${customerId}`);
    const outstanding = () => main.getByTestId("customer-outstanding").innerText();
    ok("customer profile: outstanding balance 14,000", (await outstanding()).includes("14,000 FCFA"), await outstanding());
    await main.getByLabel("Amount received (FCFA)").fill("5000");
    await main.getByLabel("Paid by").selectOption("orange_money");
    await main.getByLabel("Reference (optional)").fill("OM-TEST-7");
    await main.getByRole("button", { name: "Record payment", exact: true }).click();
    await main.getByTestId("customer-outstanding").getByText("9,000 FCFA").waitFor({ timeout: 15000 });
    const paymentsList = await main.getByTestId("customer-payments").innerText();
    ok(
      "Test 7 — customer payment recorded: balance 14,000 → 9,000, in the payment history, applied to the unpaid sale",
      /5,000 FCFA/.test(paymentsList) && /Orange Money/.test(paymentsList) && /OM-TEST-7/.test(paymentsList) &&
        sql(`select amount_paid::int || ' ' || payment_status from orders where id = '${creditSale}'`) === "15000 partial",
      paymentsList.replace(/\n/g, " | "),
    );
    await main.getByLabel("Amount received (FCFA)").fill("50000");
    await main.getByRole("button", { name: "Record payment", exact: true }).click();
    await main.getByText("That's more than what is owed.").waitFor({ timeout: 10000 });
    ok("customer payment: can't record more than what is owed", sql(`select outstanding::int from customer_stats where customer_id = '${customerId}'`) === "9000");
    await page.screenshot({ path: "test-results/v2-customer.png", fullPage: true });
    await main.getByRole("link", { name: "New sale" }).click();
    await main.getByPlaceholder("Search products by name or SKU").waitFor({ timeout: 15000 });
    ok("customer profile: New sale opens the till with the customer chosen", (await main.getByLabel("Customer", { exact: true }).inputValue()) === customerId);

    // ---------------------------------------------------------------- Test 8: expenses
    await page.goto(`${APP}/en/dashboard/expenses`);
    await main.getByText("No expenses this month").waitFor({ timeout: 15000 });
    const expenseForm = main.locator("form").filter({ has: page.getByRole("button", { name: "Add an expense" }) });
    const monthTotal = () => main.getByTestId("expenses-month-total").innerText();
    const addExpense = async (category, amount, description, date) => {
      await expenseForm.getByLabel("Category").selectOption(category);
      await expenseForm.getByLabel("Amount (FCFA)").fill(amount);
      if (date) await expenseForm.getByLabel("Date").fill(date);
      await expenseForm.getByLabel("Paid by (optional)").selectOption("cash");
      await expenseForm.getByLabel("Description (optional)").fill(description);
      await expenseForm.getByRole("button", { name: "Add an expense" }).click();
    };
    await addExpense("rent", "50 000", "Shop rent");
    await main.getByText("Expense recorded.").waitFor({ timeout: 10000 });
    await addExpense("transport", "3500", "Fuel for deliveries");
    await main.getByTestId("expenses-month-total").getByText("53,500 FCFA").waitFor({ timeout: 10000 });
    ok(
      "Test 8 — expenses recorded: month total 53,500, by category, who recorded them",
      sql(`select count(*) || ' ' || sum(amount)::int from expenses where business_id = '${bizId}'`) === "2 53500" &&
        /Rent/.test(await main.getByTestId("expenses-by-category").innerText()) && /Marie Josée/.test(await main.locator("table").innerText()),
    );
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await addExpense("other", "1000", "Future", future);
    await main.getByText("Enter a valid date, not in the future.").waitFor({ timeout: 10000 });
    ok("expenses: a date in the future is refused", sql(`select count(*) from expenses where business_id = '${bizId}'`) === "2");
    await main.locator("tr", { hasText: "Fuel for deliveries" }).getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/dashboard\/expenses\/[0-9a-f-]{36}$/);
    await main.getByLabel("Amount (FCFA)").fill("4000");
    await main.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/dashboard\/expenses\?month=.*saved=1/);
    await main.getByTestId("expenses-month-total").getByText("54,000 FCFA").waitFor({ timeout: 10000 }).catch(() => {});
    ok("expenses: edited, the total follows (54,000)", (await monthTotal()).includes("54,000 FCFA"), (await monthTotal()) + " db=" + sql(`select string_agg(amount::int::text, ',') from expenses where business_id = '${bizId}'`));
    await main.locator("tr", { hasText: "Fuel for deliveries" }).getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/dashboard\/expenses\/[0-9a-f-]{36}$/);
    await main.getByRole("button", { name: "Delete" }).click();
    await main.getByRole("button", { name: "Yes, delete" }).click();
    await page.waitForURL(/\/dashboard\/expenses\?deleted=1/);
    await main.getByTestId("expenses-month-total").getByText("50,000 FCFA").waitFor({ timeout: 10000 }).catch(() => {});
    ok("expenses: deleted, the total follows (50,000)", (await monthTotal()).includes("50,000 FCFA") && sql(`select count(*) from expenses where business_id = '${bizId}'`) === "1");
    await page.screenshot({ path: "test-results/v2-expenses.png", fullPage: true });

    // ---------------------------------------------------------------- phone
    await page.setViewportSize({ width: 390, height: 844 });
    await pos();
    await addProduct("T-Shirt");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("POS on a phone: no sideways scrolling, the Complete button stays in reach", overflow <= 0 && (await main.getByRole("button", { name: /Complete sale/ }).isVisible()), `+${overflow}px`);
    await page.screenshot({ path: "test-results/v2-pos-phone.png", fullPage: false });
    await page.setViewportSize({ width: 1440, height: 900 });

    ok("no browser errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    results.push(`CRASH ${e.message}`);
    process.exitCode = 1;
    await page.screenshot({ path: "test-results/v2-crash.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log(results.join("\n"));
  }
})();
