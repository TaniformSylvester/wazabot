/*
 * End-to-end test of customers and orders working together: customer IDs
 * (automatic, unique under concurrent creation, searchable, copyable),
 * duplicate-name warnings, orders linked to the right customer, order
 * details, partial payments, balances, voids, returns and refunds, walk-in
 * sales linked afterwards, invoices and receipts, filters and totals.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:customers-orders
 */
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { promisify } from "node:util";
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
const sqlAsync = promisify(execFile);
/** Runs SQL as a signed-in user (RLS and role checks apply), like the app does. */
const asUser = (userId, q) =>
  execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtA", "-f", "-"], {
    encoding: "utf8",
    input: `begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true) is not null as ok \\gset\n${q};\ncommit;\n`,
  }).trim();
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
  const OWNER = { name: "Nadège Owner", business: "Nadège Couture", email: `co-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  try {
    await register(page, OWNER);
    const ownerId = sql(`select id from auth.users where email = '${OWNER.email}'`);
    const bizId = sql(`select business_id from business_members where user_id = '${ownerId}'`);
    sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now(), free_limits_from = '2099-12-31' where id = '${bizId}'`);
    const productId = sql(`insert into public.products (business_id, name, sku, price, stock_quantity) values ('${bizId}', 'Robe wax', 'RW-01', 31000, 10) returning id`);

    // ---------------------------------------------------------------- customers: automatic IDs
    await page.goto(`${APP}/en/dashboard/customers/new`);
    await main.getByLabel("Name").fill("Paul Test");
    await main.getByLabel("WhatsApp number").fill("6 70 10 00 02");
    await main.getByRole("button", { name: /Save|Add customer|Create/ }).first().click();
    await page.waitForURL(/\/dashboard\/customers\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    const created = await main.getByTestId("customer-created").innerText();
    ok("a new customer gets an ID automatically and it is shown after saving", /Customer ID: CUS-000001/.test(created), created);
    const paulId = page.url().match(/customers\/([0-9a-f-]{36})/)[1];
    ok("the phone is stored in international format", sql(`select whatsapp_phone from customers where id = '${paulId}'`) === "237670100002");

    await page.goto(`${APP}/en/dashboard/customers/new`);
    await main.getByLabel("Name").fill("paul test");
    await main.getByLabel("WhatsApp number").fill("+237 670 10 00 03");
    await main.getByRole("button", { name: /Save|Add customer|Create/ }).first().click();
    await page.waitForURL(/\/dashboard\/customers\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    const paul2Id = page.url().match(/customers\/([0-9a-f-]{36})/)[1];
    const dup = await main.getByTestId("possible-duplicates").innerText();
    ok("same name: the second customer is created (CUS-000002) with a warning naming the other, not merged", /CUS-000001/.test(dup) && /CUS-000002/.test(await main.getByTestId("customer-created").innerText()) && paul2Id !== paulId, dup);

    await page.goto(`${APP}/en/dashboard/customers/new`);
    await main.getByLabel("Name").fill("Someone else");
    await main.getByLabel("WhatsApp number").fill("670100002");
    await main.getByRole("button", { name: /Save|Add customer|Create/ }).first().click();
    await main.getByText("A customer with this WhatsApp number already exists.").waitFor({ timeout: 10000 });
    ok("the same WhatsApp number is refused (no duplicate customer)", sql(`select count(*) from customers where business_id = '${bizId}'`) === "2");

    // 20 customers created at the same moment (separate connections): 20 different IDs, none reused.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sqlAsync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", `insert into public.customers (business_id, whatsapp_phone, name) values ('${bizId}', '2376702000${String(i).padStart(2, "0")}', 'Bulk ${i}')`]),
      ),
    );
    const refs = sql(`select count(*) || ' ' || count(distinct reference) || ' ' || max(reference) from customers where business_id = '${bizId}'`);
    ok("20 customers created at the same time get 20 different IDs (CUS-000003 … CUS-000022)", refs === "22 22 CUS-000022", refs);

    await page.goto(`${APP}/en/dashboard/customers?q=CUS-000002`);
    const rowsByRef = await main.locator("tbody tr").allInnerTexts();
    ok("customers can be found by their ID", rowsByRef.length === 1 && /CUS-000002/.test(rowsByRef[0]), rowsByRef.join(" | "));
    await page.goto(`${APP}/en/dashboard/customers?q=${encodeURIComponent("+237 670 10 00 02")}`);
    ok("…and by phone typed with spaces", (await main.locator("tbody tr").count()) === 1 && /Paul Test/.test(await main.locator("tbody tr").first().innerText()));
    await page.goto(`${APP}/en/dashboard/customers`);
    ok("the Customers table has a Customer ID column next to the name", (await main.locator("thead th").nth(1).innerText()).toLowerCase() === "customer id" && (await main.locator(`tr[data-reference="CUS-000001"]`).count()) === 1);
    await page.screenshot({ path: "test-results/co-customers.png", fullPage: false });

    // ---------------------------------------------------------------- a new order for the right Paul
    await page.goto(`${APP}/en/dashboard/orders/new`);
    const option = await main.getByLabel("Customer").locator("option", { hasText: "CUS-000001" }).getAttribute("value");
    await main.getByLabel("Customer").selectOption(option);
    await main.getByRole("button", { name: "Add product" }).click();
    await main.getByLabel("Product").selectOption(productId);
    await main.getByLabel("Qty").fill("2");
    await main.getByLabel("Delivery method").selectOption("delivery");
    await main.getByLabel("Recipient", { exact: true }).fill("Paul");
    await main.getByLabel("Delivery address").fill("Bonamoussadi, Douala");
    await main.getByRole("button", { name: "New order" }).click();
    await page.waitForURL(/\/dashboard\/orders\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    const orderId = page.url().match(/orders\/([0-9a-f-]{36})/)[1];
    const orderNumber = sql(`select order_number from orders where id = '${orderId}'`);
    const custPanel = await main.getByTestId("order-customer-panel").innerText();
    ok("the order is linked to the chosen customer (name, ID, phone shown)", sql(`select customer_id from orders where id = '${orderId}'`) === paulId && /CUS-000001/.test(custPanel) && /\+237670100002/.test(custPanel), custPanel.replace(/\n/g, " | "));
    const items = await main.getByTestId("order-items").innerText();
    ok("order details: product, SKU, unit price at the time, quantity, line total", /Robe wax/.test(items) && /RW-01/.test(items) && /31,000/.test(items) && /62,000/.test(items), items.replace(/\n/g, " | "));
    ok("the stock is taken once", sql(`select stock_quantity from products where id = '${productId}'`) === "8");
    sql(`update products set price = 35000 where id = '${productId}'`);
    await page.reload();
    ok("changing the product's price later doesn't change the order", /31,000/.test(await main.getByTestId("order-items").innerText()) && !/35,000/.test(await main.getByTestId("order-items").innerText()));

    // Payments: 25,000 then 17,000 on 62,000.
    const pay = async (amount, method, reference) => {
      const form = main.getByTestId("record-payment");
      await form.getByLabel(/Amount received/).fill(String(amount));
      await form.getByLabel("Paid by").selectOption(method);
      if (reference) await form.getByLabel("Reference (optional)").fill(reference);
      await form.getByRole("button", { name: "Record payment" }).click();
      await form.getByText("Payment recorded.").waitFor({ timeout: 10000 });
      await page.reload();
    };
    await pay(25000, "mtn_momo", "MP261009.1200.A1");
    await pay(17000, "cash");
    const due = await main.getByTestId("order-balance-due").innerText();
    ok("25,000 + 17,000 on 62,000: balance due 20,000, partially paid", /20,000/.test(due) && sql(`select payment_status || ' ' || amount_paid::int from orders where id = '${orderId}'`) === "partial 42000", due);

    // Orders list: balance, View details, customer shown with ID, search and filters, totals.
    await page.goto(`${APP}/en/dashboard/orders`);
    const row = main.locator("tbody tr", { hasText: orderNumber });
    ok("orders list: customer with their ID, balance due, View details", /CUS-000001/.test(await row.innerText()) && /20,000/.test(await row.getByTestId("order-balance").innerText()) && (await row.getByRole("link", { name: /View details/ }).count()) === 1);
    const summary = await main.getByTestId("orders-summary").innerText();
    ok("totals: order value, payments received (money collected) and balance due shown apart", /62,000/.test(summary) && /42,000/.test(summary) && /20,000/.test(summary), summary.replace(/\n/g, " | "));
    await page.goto(`${APP}/en/dashboard/orders?q=CUS-000001`);
    await main.locator("tbody tr").first().waitFor({ timeout: 15000 }).catch(() => {});
    ok("orders can be searched by customer ID", (await main.locator("tbody tr").count()) === 1, (await main.innerText()).slice(0, 900).replace(/\n/g, " | "));
    await page.goto(`${APP}/en/dashboard/orders?q=CUS-000002`);
    ok("…and the other Paul has none", (await main.locator("tbody tr").count()) === 0);
    await page.goto(`${APP}/en/dashboard/orders?balance=1`);
    ok("filter: orders with a balance due", (await main.locator("tbody tr").count()) === 1);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await page.goto(`${APP}/en/dashboard/orders?from=${tomorrow}`);
    ok("filter: date range", (await main.locator("tbody tr").count()) === 0);

    // Customer profile: history and the link to all their orders.
    await page.goto(`${APP}/en/dashboard/customers/${paulId}`);
    ok("customer profile: the order is in their history", (await main.getByTestId("customer-purchases").innerText()).includes(orderNumber));
    await page.goto(`${APP}/en/dashboard/customers/${paul2Id}`);
    ok("…and not in the other Paul's", !(await main.innerText()).includes(orderNumber));

    // Delivered: the customer owes 20,000, the same as the order's balance.
    await page.goto(`${APP}/en/dashboard/orders/${orderId}`);
    await main.getByLabel("Order status").selectOption("delivered");
    await main.getByRole("button", { name: "Save" }).click();
    await main.getByText("Order updated.").waitFor({ timeout: 10000 });
    await page.goto(`${APP}/en/dashboard/customers`);
    const paulRow = await main.locator(`tr[data-reference="CUS-000001"]`).innerText();
    ok("Customers: Paul has 1 purchase, spent 62,000, owes 20,000 (= the order's balance)", /\b1\b/.test(paulRow) && /62,000/.test(paulRow) && /20,000/.test(paulRow), paulRow.replace(/\s+/g, " "));

    // Invoice and receipt.
    await page.goto(`${APP}/en/dashboard/orders/${orderId}/document?type=invoice`);
    const invoice = await main.getByTestId("document-invoice").innerText();
    ok("invoice: number from the order, business, customer, items, totals, paid and balance; says it is not proof of payment",
      invoice.includes(orderNumber.replace("ORD-", "INV-")) && /Nadège Couture/.test(invoice) && /CUS-000001/.test(invoice) && /Robe wax/.test(invoice) && /62,000/.test(invoice) && /42,000/.test(invoice) && /20,000/.test(invoice) && /not proof of payment/.test(invoice));
    await page.screenshot({ path: "test-results/co-invoice.png", fullPage: true });
    await page.goto(`${APP}/en/dashboard/orders/${orderId}/document?type=receipt`);
    const receipt = await main.getByTestId("document-receipt").innerText();
    ok("receipt: lists the two payments recorded (with the MoMo reference) and says payments are recorded by hand", /MP261009\.1200\.A1/.test(receipt) && /25,000/.test(receipt) && /17,000/.test(receipt) && /recorded by hand/.test(receipt));

    // Void the 17,000 cash payment recorded by mistake.
    await page.goto(`${APP}/en/dashboard/orders/${orderId}`);
    const voidBox = main.getByTestId("void-payment");
    await voidBox.locator("summary").click();
    const cashGroup = sql(`select group_id from order_payments where order_id = '${orderId}' and amount = 17000`);
    await voidBox.getByLabel("Type").selectOption(cashGroup);
    await voidBox.getByLabel("Reason").fill("Entered twice by mistake");
    await voidBox.getByRole("button", { name: "Void payment" }).click();
    await voidBox.getByText("Payment voided.").waitFor({ timeout: 10000 });
    await page.reload();
    ok("voiding a payment: it stays in the history marked voided, the balance goes back to 37,000",
      /37,000/.test(await main.getByTestId("order-balance-due").innerText()) && (await main.locator('[data-voided="1"]').count()) === 1 && /Entered twice by mistake/.test(await main.getByTestId("payment-rows").innerText()));

    // Return: stock back, no debt, refund part of what was paid.
    await main.getByLabel("Order status").selectOption("returned");
    await main.getByRole("button", { name: "Save" }).click();
    await main.getByText("Order updated.").waitFor({ timeout: 10000 });
    await page.reload();
    ok("returned: stock back, nothing owed", sql(`select stock_quantity from products where id = '${productId}'`) === "10" && sql(`select balance_due::int from orders where id = '${orderId}'`) === "0");
    const refundBox = main.getByTestId("record-refund");
    await refundBox.getByLabel(/Amount refunded/).fill("10000");
    await refundBox.getByRole("button", { name: "Record refund" }).click();
    await refundBox.getByText("Refund recorded.").waitFor({ timeout: 10000 });
    await page.reload();
    ok("refund recorded: payment status Part refunded, money collected net 15,000",
      sql(`select payment_status from orders where id = '${orderId}'`) === "partially_refunded" && sql(`select amount_paid::int from customer_stats where customer_id = '${paulId}'`) === "15000");
    ok("Paul no longer owes anything and has no purchase", sql(`select outstanding::int || ' ' || orders_count from customer_stats where customer_id = '${paulId}'`) === "0 0");
    const history = await main.getByTestId("order-history").innerText();
    ok("status history with who and when", /Order recorded/.test(history) && /Delivered/.test(history) && /Returned/.test(history) && /Nadège Owner/.test(history), history.replace(/\n/g, " | "));
    await page.screenshot({ path: "test-results/co-order-returned.png", fullPage: true });

    // A walk-in sale (no customer): shown as such, not "+"; linked to Paul's namesake later.
    const saleId = asUser(ownerId, `select public.create_sale('${bizId}', gen_random_uuid(), '[{"product_id":"${productId}","quantity":1}]'::jsonb, null, 0, '[{"amount":35000,"method":"cash"}]'::jsonb)`).split("\n").pop();
    await page.goto(`${APP}/en/dashboard/orders`);
    const walkInRow = main.locator("tbody tr").first();
    ok('a walk-in sale shows "Walk-in customer", never "+"', /Walk-in customer/.test(await walkInRow.getByTestId("order-customer").innerText()) && (await walkInRow.getByTestId("order-customer").innerText()).trim() !== "+");
    await page.goto(`${APP}/en/dashboard/orders/${saleId}`);
    const link = main.getByTestId("link-customer");
    const opt = await link.getByLabel("Customer").locator("option", { hasText: "CUS-000002" }).getAttribute("value");
    await link.getByLabel("Customer").selectOption(opt);
    await link.getByRole("button", { name: "Link customer" }).click();
    // Once linked, the form is gone and the customer is shown.
    await main.getByTestId("order-customer-panel").getByText("CUS-000002").waitFor({ timeout: 10000 });
    await page.reload();
    ok("an owner links the walk-in sale to the right customer, once (no form afterwards)", /CUS-000002/.test(await main.getByTestId("order-customer-panel").innerText()) && (await main.getByTestId("link-customer").count()) === 0 && sql(`select orders_count from customer_stats where customer_id = '${paul2Id}'`) === "1");

    // Phones.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/en/dashboard/orders", `/en/dashboard/orders/${orderId}`, "/en/dashboard/customers", `/en/dashboard/orders/${orderId}/document?type=invoice`]) {
      await page.goto(`${APP}${path}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(`no sideways scrolling at 390px on ${path.replace(/[0-9a-f-]{36}/, ":id")}`, over <= 0, `+${over}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${APP}/fr/dashboard/orders`);
    ok("orders page in French", /Reste à payer/.test(await main.innerText()) && /Voir le détail/.test(await main.innerText()) && /Paiements reçus/.test(await main.innerText()));

    ok("no browser errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    results.push(`CRASH ${e.message}`);
    process.exitCode = 1;
    await page.screenshot({ path: "test-results/co-crash.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log(results.join("\n"));
  }
})();
