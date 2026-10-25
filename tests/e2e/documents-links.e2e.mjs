/*
 * End-to-end test of WazaBolt Docs Phase 2: an invoice made from an order,
 * payments recorded against invoices (the order's payments for an order's
 * invoice), receipts made only from recorded payments, voids, a customer's
 * statement of account, and documents sent on WhatsApp (through the local
 * fake Graph API: media upload + document message, only inside the 24-hour
 * window), against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:documents-links
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { FAKE, startFakeGraph } from "./fake-graph.mjs";

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
const year = new Date().getFullYear();

mkdirSync("test-results", { recursive: true });

(async () => {
  const graph = await startFakeGraph(4010);
  const stamp = Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  const main = page.locator("main");
  const settle = async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    await sleep(400);
  };

  try {
    // ---------------------------------------------------------------- Setup: owner, customer, order
    const OWNER = { name: "Awa Nkeng", business: "Awa Styles Links", email: `docs-links+${stamp}@example.com`, password: "Wazabolt2026" };
    await page.goto(`${APP}/en/register`);
    await page.getByLabel("Your name").fill(OWNER.name);
    await page.getByLabel("Business name").fill(OWNER.business);
    await page.getByLabel("Email", { exact: true }).fill(OWNER.email);
    await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    await page.goto(linkFrom(await latestMail(OWNER.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/onboarding/);
    const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now(), free_limits_from = '2099-12-31', default_language = 'en', city = 'Douala', phone = '+237 699 000 001' where id = '${biz}'`);
    sql(`update ai_settings set ai_enabled = false where business_id = '${biz}'`);
    const PHONE = `2376704${String(stamp).slice(-5)}`;
    sql(`insert into customers (business_id, whatsapp_phone, name, city) values ('${biz}', '${PHONE}', 'Brenda Nkeng', 'Douala')`);
    const cust = sql(`select id from customers where business_id = '${biz}' and whatsapp_phone = '${PHONE}'`);
    const custRef = sql(`select reference from customers where id = '${cust}'`);
    // 2 × 15 000 + 5 000, delivery 2 000, discount 1 000 = 36 000.
    sql(`insert into orders (business_id, customer_id, order_number, status, subtotal, delivery_fee, discount, total, delivery_address, created_at)
         values ('${biz}', '${cust}', 'ORD-00901', 'confirmed', 35000, 2000, 1000, 36000, 'Akwa, Douala', now() - interval '2 days')`);
    const order = sql(`select id from orders where business_id = '${biz}' and order_number = 'ORD-00901'`);
    sql(`insert into order_items (business_id, order_id, product_name, variant, quantity, unit_price, total) values ('${biz}', '${order}', 'Robe wax', 'Rouge / M', 2, 15000, 30000)`);
    sql(`insert into order_items (business_id, order_id, product_name, quantity, unit_price, total) values ('${biz}', '${order}', 'Foulard', 1, 5000, 5000)`);

    // ---------------------------------------------------------------- Invoice from the order
    await page.goto(`${APP}/en/dashboard/orders/${order}`);
    await main.getByRole("button", { name: "Issue invoice" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[0-9a-f-]{36}\?issued=1/, { timeout: 15000 });
    const invoiceUrl = page.url().split("?")[0];
    const inv = invoiceUrl.split("/").pop();
    const invNumber = `INV-${year}-000001`;
    await settle();
    ok("order → Issue invoice: a numbered invoice, issued", (await main.getByRole("heading", { name: `Invoice ${invNumber}` }).count()) === 1);
    ok("order invoice: lines, delivery, discount and total from the order", (await main.getByTestId("preview-total").innerText()) === "36,000 FCFA" && (await main.getByTestId("document-preview").getByText("Delivery", { exact: true }).count()) === 1 && (await main.getByTestId("document-preview").getByText("Rouge / M").count()) === 1);
    ok("order invoice: names the order and links to it", (await main.getByTestId("document-preview").getByText("ORD-00901").count()) === 1 && (await main.getByTestId("doc-order-link").count()) === 1);
    ok("order invoice: can't be duplicated (remade from the order instead)", (await main.getByRole("button", { name: "Duplicate" }).count()) === 0);
    await page.goto(`${APP}/en/dashboard/orders/${order}`);
    ok("order page: links to its invoice instead of offering a second one", (await main.getByTestId("order-invoice-link").innerText()).includes(invNumber) && (await main.getByRole("button", { name: "Issue invoice" }).count()) === 0);

    // ---------------------------------------------------------------- Payments on the order's invoice
    await page.goto(invoiceUrl);
    const record = main.getByTestId("record-invoice-payment");
    ok("invoice: the payment form starts at the balance (36,000)", (await record.getByLabel(/Amount received/).inputValue()) === "36000");
    await record.getByLabel(/Amount received/).fill("10000");
    await record.getByLabel("Paid by").selectOption("mtn_momo");
    await record.getByLabel("Reference (optional)").fill("MP2401");
    await record.getByRole("button", { name: "Record payment" }).click();
    await main.getByText("Payment recorded.").waitFor({ timeout: 10000 });
    await page.reload();
    await settle();
    ok("invoice: partly paid after a payment, balance 26,000", (await main.getByText("Partly paid", { exact: true }).count()) >= 1 && (await main.getByTestId("invoice-balance").innerText()).includes("26,000"));
    ok("invoice: the payment is the order's payment (same money, one ledger)", sql(`select amount_paid || ' ' || payment_status from orders where id = '${order}'`) === "10000.00 partial" && sql(`select count(*) from invoice_payments where business_id = '${biz}'`) === "0");
    ok("invoice PDF preview: Paid and Balance due", (await main.getByTestId("preview-totals").innerText()).includes("Paid") && (await main.getByTestId("preview-totals").innerText()).includes("26,000"));

    // Receipt from the recorded payment.
    await main.getByTestId("invoice-payment-rows").getByRole("button", { name: "Make receipt" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[0-9a-f-]{36}\?issued=1/, { timeout: 15000 });
    await settle();
    const receiptUrl = page.url().split("?")[0];
    const recNumber = `REC-${year}-000001`;
    const preview = main.getByTestId("document-preview");
    ok("Make receipt: a numbered receipt for the payment", (await main.getByRole("heading", { name: `Receipt ${recNumber}` }).count()) === 1);
    ok(
      "receipt: amount, MoMo reference, the invoice, its total, paid to date and the balance left",
      (await main.getByTestId("preview-total").innerText()) === "10,000 FCFA" &&
        (await preview.getByText("MP2401").count()) >= 1 &&
        (await preview.getByText(invNumber).count()) >= 1 &&
        (await preview.getByText("Invoice total: 36,000 FCFA").count()) === 1 &&
        (await main.getByTestId("preview-totals").innerText()).includes("26,000"),
    );
    ok("receipt: links back to the invoice", (await main.getByTestId("doc-invoice-link").innerText()).includes(invNumber));
    const [rdl] = await Promise.all([page.waitForEvent("download"), main.getByTestId("doc-pdf").click()]);
    const rpdf = readFileSync(await rdl.path());
    writeFileSync("test-results/docs-payment-receipt.pdf", rpdf);
    ok("receipt PDF downloads", rpdf.subarray(0, 5).toString() === "%PDF-" && rdl.suggestedFilename() === `receipt-${recNumber}.pdf`, rdl.suggestedFilename());

    // The invoice shows the receipt; a second click can't make a second one.
    await page.goto(invoiceUrl);
    ok("invoice: the payment row links to its receipt", (await main.getByTestId("payment-receipt-link").innerText()) === recNumber);
    await page.goto(`${APP}/en/dashboard/orders/${order}`);
    ok("order page: the payment's receipt is shown there too", (await main.getByTestId("payment-receipt-link").innerText()) === recNumber);

    // A payment with a receipt can't be voided (void the receipt first).
    const voidBox = main.getByTestId("void-payment");
    await voidBox.locator("summary").click();
    await voidBox.locator('select[name="group_id"]').selectOption({ index: 1 });
    await voidBox.getByLabel("Reason").fill("Wrong amount");
    await voidBox.getByRole("button", { name: "Void payment" }).click();
    await main.getByText(`This payment has receipt ${recNumber}`).waitFor({ timeout: 10000 });
    ok("order: voiding a payment that has a receipt is refused, naming the receipt", sql(`select count(*) from order_payments where order_id = '${order}' and voided_at is null`) === "1");

    // The rest is paid on the order: the invoice becomes Paid.
    const orderPay = main.getByTestId("record-payment");
    await orderPay.getByLabel(/Amount received/).fill("26000");
    await orderPay.getByRole("button", { name: "Record payment" }).click();
    // Paid in full: the form goes away with its message, so wait for the ledger.
    for (let i = 0; i < 40 && sql(`select amount_paid from orders where id = '${order}'`) !== "36000.00"; i++) await sleep(250);
    await page.goto(invoiceUrl);
    await settle();
    ok("a payment recorded on the order pays its invoice: Paid, stamped", (await main.getByText("Paid", { exact: true }).count()) >= 1 && (await main.getByTestId("preview-stamp").innerText()).toLowerCase() === "paid" && (await main.getByTestId("invoice-balance").innerText()) === "Paid in full");
    ok("a paid invoice has no payment form", (await main.getByTestId("record-invoice-payment").count()) === 0);

    // ---------------------------------------------------------------- A standalone invoice
    const snap = `'{"name":"Awa Styles Links"}'`;
    const userId = sql(`select id from auth.users where email = '${OWNER.email}'`);
    sql(`insert into documents (business_id, doc_type, issue_date, due_date, customer_id, business_snapshot, customer_snapshot, items, subtotal, total, created_by)
         values ('${biz}', 'invoice', current_date - 1, current_date + 13, '${cust}', ${snap}, '{"name":"Brenda Nkeng"}', '[{"description":"Couture robe de soirée","quantity":1,"unitPrice":50000}]', 50000, 50000, '${userId}')`);
    const sinv = sql(`select id from documents where business_id = '${biz}' and doc_type = 'invoice' and status = 'draft'`);
    await page.goto(`${APP}/en/dashboard/documents/${sinv}`);
    ok("draft invoice: no payment form, says to issue it first", (await main.getByText("Issue the invoice to record payments against it.").count()) === 1 && (await main.getByTestId("record-invoice-payment").count()) === 0);
    await main.getByRole("button", { name: "Issue", exact: true }).click();
    await main.getByTestId("record-invoice-payment").waitFor({ timeout: 10000 });
    const sNumber = `INV-${year}-000002`;
    const srec = main.getByTestId("record-invoice-payment");
    await srec.getByLabel(/Amount received/).fill("60000");
    await srec.getByRole("button", { name: "Record payment" }).click();
    await main.getByText("That's more than what is owed.").waitFor({ timeout: 10000 }).catch(() => {});
    ok("standalone invoice: a payment above the balance is refused", sql(`select count(*) from invoice_payments where document_id = '${sinv}'`) === "0");
    await srec.getByLabel(/Amount received/).fill("20000");
    await srec.getByLabel("Paid by").selectOption("cheque");
    await srec.getByLabel("Reference (optional)").fill("CHQ 0042");
    await srec.getByRole("button", { name: "Record payment" }).click();
    await main.getByText("Payment recorded.").waitFor({ timeout: 10000 });
    await page.reload();
    ok("standalone invoice: a cheque payment, partly paid", sql(`select status || ' ' || amount_paid from documents where id = '${sinv}'`) === "partially_paid 20000.00" && (await main.getByTestId("invoice-balance").innerText()).includes("30,000"));

    // Void the invoice with a payment on it: refused. Void the payment: back to issued.
    const voidDoc = main.locator("form", { has: page.getByRole("button", { name: "Void document" }) }).getByLabel("Reason");
    await voidDoc.fill("Wrong customer");
    await main.getByRole("button", { name: "Void document" }).click();
    await main.getByText("Payments are recorded against this invoice. Void them first, then the invoice.").waitFor({ timeout: 10000 });
    ok("an invoice with payments can't be voided", sql(`select status from documents where id = '${sinv}'`) === "partially_paid");
    const vp = main.getByTestId("void-invoice-payment");
    await vp.locator("summary").click();
    await vp.locator('select[name="payment_id"]').selectOption({ index: 1 });
    await vp.getByLabel("Reason").fill("Cheque bounced");
    await vp.getByRole("button", { name: "Void payment" }).click();
    // The last live payment: the void section goes away with its message, so wait for the ledger.
    for (let i = 0; i < 40 && sql(`select count(*) from invoice_payments where document_id = '${sinv}' and voided_at is null`) !== "0"; i++) await sleep(250);
    ok("owner voids the payment (kept, marked voided); the invoice is unpaid again", sql(`select status || ' ' || amount_paid from documents where id = '${sinv}'`) === "issued 0.00" && sql(`select void_reason from invoice_payments where document_id = '${sinv}'`) === "Cheque bounced");
    await page.reload();
    await srec.getByLabel(/Amount received/).fill("15000");
    await srec.getByLabel("Paid by").selectOption("orange_money");
    await srec.getByRole("button", { name: "Record payment" }).click();
    await main.getByText("Payment recorded.").waitFor({ timeout: 10000 });
    await page.reload();
    await main.getByTestId("invoice-payment-rows").getByRole("button", { name: "Make receipt" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[0-9a-f-]{36}\?issued=1/, { timeout: 15000 });
    await settle();
    ok("standalone invoice: receipt from its payment (REC-…-000002, balance 35,000)", (await main.getByRole("heading", { name: `Receipt REC-${year}-000002` }).count()) === 1 && /35[ ,]000/.test(await main.getByTestId("preview-totals").innerText()) && (await main.getByTestId("document-preview").getByText(sNumber).count()) >= 1, `${page.url()} | ${await main.getByTestId("preview-totals").innerText().catch(() => "")}`);

    // ---------------------------------------------------------------- Statement of account
    await page.goto(`${APP}/en/dashboard/customers/${cust}`);
    await main.getByTestId("customer-statement-link").click();
    await page.waitForURL(/\/statement/);
    await settle();
    const rows = main.getByTestId("statement-rows").locator("tr");
    // Billed: order 36 000 (shown as its invoice) + invoice 50 000; paid: 10 000 + 26 000 + 15 000 (the voided cheque is left out).
    ok("statement: billed orders and invoices, recorded payments, voided ones left out", (await rows.count()) === 5, String(await rows.count()));
    ok("statement: closing balance 35,000 (86,000 billed − 51,000 paid)", (await main.getByTestId("statement-closing").innerText()).includes("35,000"));
    ok("statement: the order shows its invoice number", (await main.getByTestId("statement-rows").getByText(invNumber).count()) >= 1);
    await main.getByLabel("From").fill(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
    await main.getByRole("button", { name: "Show" }).click();
    await page.waitForURL(/from=/);
    await settle();
    ok("statement for a period: what came before is the opening balance", (await main.getByTestId("statement-opening").count()) === 1 && (await main.getByTestId("statement-closing").innerText()).includes("35,000"));
    const [sdl] = await Promise.all([page.waitForEvent("download"), main.getByTestId("statement-pdf").click()]);
    const spdf = readFileSync(await sdl.path());
    writeFileSync("test-results/docs-statement.pdf", spdf);
    ok("statement PDF downloads (statement-CUS-…-date.pdf)", spdf.subarray(0, 5).toString() === "%PDF-" && sdl.suggestedFilename().startsWith(`statement-${custRef}-`), sdl.suggestedFilename());
    await main.getByLabel("Language").selectOption("fr");
    await main.getByRole("button", { name: "Show" }).click();
    await page.waitForURL(/lang=fr/);
    await settle();
    ok("statement in French (amounts and words in the statement's language)", (await main.getByTestId("statement-closing").innerText()).includes("35 000 FCFA") && (await main.getByTestId("statement-rows").getByText("Facture", { exact: false }).count()) >= 1);

    // ---------------------------------------------------------------- Reports: invoice payments outside orders
    await page.goto(`${APP}/en/dashboard/reports?range=today`);
    await main.getByTestId("report-invoice-payments").waitFor({ timeout: 15000 });
    // The standalone invoice's 15 000 (the voided cheque left out); the order invoice's payments are order payments, already in sales.
    ok("reports: invoice payments outside orders (15,000, voided cheque left out)", (await main.getByTestId("report-invoice-total").innerText()).includes("15,000") && (await main.getByTestId("report-invoice-payments").getByText(sNumber).count()) === 1, await main.getByTestId("report-invoice-payments").innerText());
    const ipCsv = await page.evaluate(async (u) => (await fetch(u)).text(), `${APP}/en/dashboard/reports/export?type=invoice-payments&from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`);
    ok("reports: invoice payments CSV (one row, Orange Money)", ipCsv.trim().split("\n").length === 2 && ipCsv.includes(sNumber) && ipCsv.includes("Orange Money"), ipCsv);

    // ---------------------------------------------------------------- WhatsApp
    // Not connected yet.
    await page.goto(invoiceUrl);
    ok("WhatsApp: asks to connect first", (await main.getByTestId("whatsapp-panel").innerText()).includes("Connect your WhatsApp number to send documents."), await main.getByTestId("whatsapp-panel").innerText().catch(() => "no panel"));
    await page.goto(`${APP}/en/dashboard/whatsapp`);
    await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
    await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
    await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
    await main.getByRole("button", { name: "Connect WhatsApp" }).click();
    await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });

    // The customer hasn't written: the window is closed, nothing is sent.
    await page.goto(invoiceUrl);
    await main.getByTestId("whatsapp-window-closed").waitFor({ timeout: 10000 }).catch(() => {});
    ok("WhatsApp: outside the 24-hour window the send button is off and says why", (await main.getByTestId("whatsapp-window-closed").count()) === 1 && (await main.getByTestId("send-whatsapp").isDisabled()));
    ok("WhatsApp: nothing uploaded or sent while the window is closed", graph.sent().uploads.length === 0);

    // The customer writes: the PDF goes as a WhatsApp document.
    sql(`insert into conversations (business_id, customer_id, status, last_customer_message_at, last_message_at) values ('${biz}', '${cust}', 'open', now() - interval '1 hour', now() - interval '1 hour')`);
    await page.reload();
    await main.getByTestId("send-whatsapp").click();
    await main.getByText("Sent on WhatsApp. It's in the customer's conversation.").waitFor({ timeout: 20000 });
    const up = graph.sent().uploads.at(-1);
    const msg = graph.sent().sent.at(-1);
    ok("WhatsApp: the invoice PDF is uploaded to the business's number", up?.isPdf === true && up.type === "application/pdf" && up.product === "whatsapp" && up.filename === `invoice-${invNumber}.pdf` && up.phoneNumberId === FAKE.phoneNumberId, JSON.stringify(up));
    ok("WhatsApp: then sent as a document message to the customer, with a caption", msg?.type === "document" && msg.to === PHONE && msg.document?.id === up?.id && msg.document?.filename === `invoice-${invNumber}.pdf` && msg.document?.caption === `Invoice ${invNumber} — ${OWNER.business}`, JSON.stringify(msg));
    ok(
      "WhatsApp: recorded in the conversation as sent, counted, and audited",
      sql(`select delivery_status || ' ' || message_type || ' ' || wa_category from messages where business_id = '${biz}' and direction = 'outbound' order by created_at desc limit 1`) === "sent document service" &&
        sql(`select count(*) from audit_logs where business_id = '${biz}' and action = 'document.sent_whatsapp'`) === "1",
    );
    const conv = sql(`select id from conversations where business_id = '${biz}' and customer_id = '${cust}'`);
    await page.goto(`${APP}/en/dashboard/conversations/${conv}`);
    await main.getByTestId("sent-document").first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: "test-results/docs-links-conversation.png" });
    ok("conversation: the sent PDF shows with a link to the document", (await main.getByTestId("sent-document").getByRole("link", { name: `invoice-${invNumber}.pdf` }).count()) === 1, await main.innerText().then((x) => x.slice(0, 600)).catch(() => ""));

    // Statement on WhatsApp.
    await page.goto(`${APP}/fr/dashboard/customers/${cust}/statement?lang=fr`);
    await main.getByTestId("send-whatsapp").click();
    await main.getByText("Envoyé sur WhatsApp. Il apparaît dans la conversation du client.").waitFor({ timeout: 20000 });
    const sup = graph.sent().uploads.at(-1);
    ok("WhatsApp: the statement PDF goes too (French file name)", sup?.isPdf === true && sup.filename?.startsWith(`releve-${custRef}-`) && graph.sent().sent.at(-1)?.document?.caption === `Relevé de compte — ${OWNER.business}`, JSON.stringify(sup));

    // A draft can't be sent.
    sql(`insert into documents (business_id, doc_type, customer_id, business_snapshot, customer_snapshot, items, subtotal, total, created_by)
         values ('${biz}', 'quotation', '${cust}', ${snap}, '{"name":"Brenda Nkeng"}', '[{"description":"x","quantity":1,"unitPrice":1}]', 1, 1, '${userId}')`);
    const draft = sql(`select id from documents where business_id = '${biz}' and doc_type = 'quotation'`);
    await page.goto(`${APP}/en/dashboard/documents/${draft}`);
    ok("a draft has no Send on WhatsApp", (await main.getByTestId("whatsapp-panel").count()) === 0);

    // ---------------------------------------------------------------- Phones
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const m = await phone.newPage();
    for (const path of [`/en/dashboard/documents/${inv}`, `/en/dashboard/customers/${cust}/statement`, `/en/dashboard/orders/${order}`]) {
      await m.goto(`${APP}${path}`);
      await sleep(500);
      ok(`fits a 390 px phone: ${path.split("/").slice(3, 5).join("/")}`, (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    }
    await m.screenshot({ path: "test-results/docs-links-mobile.png", fullPage: true });
    await phone.close();
    await page.goto(invoiceUrl);
    await main.getByTestId("document-preview").waitFor({ timeout: 10000 });
    await settle();
    await page.screenshot({ path: "test-results/docs-links-invoice.png", fullPage: true });

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
    await page.screenshot({ path: "test-results/docs-links-failure.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    graph.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
