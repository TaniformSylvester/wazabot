/*
 * End-to-end test of WazaBolt Docs: the free guest generator (receipts,
 * invoices, quotations as PDF, nothing saved, rate limit, logo checks) and
 * business documents (customers and products filled in, drafts, numbering,
 * issue, duplicate, void, quotation status, settings, PDF), against the local
 * stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:documents
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

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
const pages = (buf) => (buf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
// A real PNG logo.
const PNG = await sharp({ create: { width: 120, height: 120, channels: 3, background: "#16b878" } }).png().toBuffer();
const guestDoc = (over = {}) => ({
  type: "invoice", template: "modern", language: "fr", currency: "XAF", number: null, issueDate: "2026-10-22", dueDate: "2026-11-05",
  business: { name: "Boutique Test" }, customer: { name: "Client Test" }, items: [{ description: "Article", quantity: 1, unitPrice: 1000 }], ...over,
});
const postGuest = (body, ip) => fetch(`${APP}/api/documents/guest`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) });

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  try {
    // ================================================================ Guest generator (French)
    const guestRowsBefore = Number(sql("select count(*) from guest_document_requests"));
    await page.goto(`${APP}/fr/tools/documents`);
    await main.getByLabel("Nom de l'entreprise").fill("Boutique Awa");
    await main.getByTestId("doc-download").click();
    await main.getByText("Vérifiez les champs en rouge.").waitFor({ timeout: 10000 });
    ok("guest: missing customer and line are flagged before anything is sent", (await main.getByRole("alert").filter({ hasText: "Ce champ est obligatoire." }).count()) >= 2);

    await main.getByLabel("Nom du client").fill("Brenda Nkeng");
    await main.getByLabel("Désignation").first().fill("Robe wax");
    await main.getByLabel("Qté").first().fill("2");
    await main.getByLabel("Prix unitaire").first().fill("15000");
    await main.getByRole("button", { name: "Ajouter une ligne" }).click();
    await main.getByLabel("Désignation").nth(1).fill("Sac en raphia");
    await main.getByLabel("Prix unitaire").nth(1).fill("8000");
    await main.getByLabel("Remise %").nth(1).fill("10");
    await main.getByLabel("Remise (montant)").fill("1000");
    await main.getByLabel("Taux de taxe (%)").fill("19.25");
    ok("guest: live total from the engine (37,200 − 1,000 + 19.25 % = 43,169)", (await main.getByTestId("preview-total").innerText()) === "43 169 FCFA", await main.getByTestId("preview-total").innerText());
    await main.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await main.getByRole("radio", { name: /Classique/ }).click();
    await page.screenshot({ path: "test-results/docs-guest.png", fullPage: true });
    const [dl] = await Promise.all([page.waitForEvent("download"), main.getByTestId("doc-download").click()]);
    const pdf = readFileSync(await dl.path());
    writeFileSync("test-results/docs-guest-invoice.pdf", pdf);
    ok("guest: invoice downloads as a one-page PDF named facture.pdf, with the logo", pdf.subarray(0, 5).toString() === "%PDF-" && pages(pdf) === 1 && dl.suggestedFilename() === "facture.pdf" && pdf.includes("/Subtype /Image"), dl.suggestedFilename());
    await main.getByTestId("doc-invite").waitFor({ timeout: 5000 });
    ok("guest: after the download, an invitation to sign up (the PDF was not blocked)", (await main.getByText("Créer un compte gratuit").count()) === 1);
    ok("guest: nothing is saved — only a hashed rate-limit entry, no IP and no document", sql("select count(*) from documents where business_snapshot->>'name' = 'Boutique Awa'") === "0" && Number(sql("select count(*) from guest_document_requests")) === guestRowsBefore + 1 && !sql("select string_agg(key, ',') from guest_document_requests").includes("127.0.0.1"));

    // Receipt and quotation from the same page.
    for (const [label, type, name] of [["Reçu", "receipt", "recu.pdf"], ["Devis", "quotation", "devis.pdf"]]) {
      await main.getByRole("radio", { name: new RegExp(`^${label}`) }).click();
      if (type === "receipt") await main.getByLabel("Mode de paiement").selectOption("orange_money");
      const [d2] = await Promise.all([page.waitForEvent("download"), main.getByTestId("doc-download").click()]);
      const b2 = readFileSync(await d2.path());
      ok(`guest: ${type} PDF`, b2.subarray(0, 5).toString() === "%PDF-" && d2.suggestedFilename() === name, d2.suggestedFilename());
    }

    // Server checks: validation, size, logo, rate limit.
    let res = await postGuest({ document: guestDoc({ items: [] }) }, "203.0.113.5");
    ok("guest API: a document without lines is refused (422)", res.status === 422 && (await res.json()).issues?.[0]?.message === "min_one_item");
    res = await postGuest({ document: guestDoc(), logo: "data:image/png;base64," + Buffer.from("not an image at all").toString("base64") }, "203.0.113.5");
    ok("guest API: a file that isn't a real image is refused as a logo", res.status === 422 && (await res.json()).error === "logo_invalid");
    res = await fetch(`${APP}/api/documents/guest`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.5" }, body: "x".repeat(1_700_000) });
    ok("guest API: oversized requests are refused (413)", res.status === 413);
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await postGuest({ document: guestDoc() }, "198.51.100.77")).status);
    ok("guest API: 30 PDFs per hour per visitor, then 429", statuses.slice(0, 30).every((s) => s === 200) && statuses[30] === 429, statuses.join(","));
    ok("guest API: another visitor isn't affected", (await postGuest({ document: guestDoc() }, "198.51.100.78")).status === 200);

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await phone.newPage();
    await m.goto(`${APP}/en/tools/documents`);
    await sleep(600);
    ok("guest: fits a 390 px phone", (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    await m.getByTestId("doc-toggle-preview").click();
    ok("guest: phones switch to the preview", await m.getByTestId("document-preview").isVisible());
    await m.screenshot({ path: "test-results/docs-guest-mobile.png" });
    await phone.close();

    // ================================================================ Business documents
    const OWNER = { name: "Awa Nkeng", business: "Awa Styles Docs", email: `docs-owner+${stamp}@example.com`, password: "Wazabolt2026" };
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
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now(), free_limits_from = '2099-12-31', address = 'Rue Joss, Akwa', city = 'Douala', phone = '+237 699 000 001' where id = '${biz}'`);
    sql(`insert into customers (business_id, whatsapp_phone, name, email) values ('${biz}', '237670400001', 'Brenda Nkeng', 'brenda@example.com')`);
    const cust = sql(`select id from customers where business_id = '${biz}' and name = 'Brenda Nkeng'`);
    sql(`insert into products (business_id, name, price, stock_quantity) values ('${biz}', 'Robe wax', 15000, 10)`);
    const prod = sql(`select id from products where business_id = '${biz}' and name = 'Robe wax'`);
    sql(`insert into product_variants (business_id, product_id, name, value, price_modifier) values ('${biz}', '${prod}', 'Size', 'XL', 1000)`);
    sql(`insert into services (business_id, name, price, duration_minutes) values ('${biz}', 'Retouche', 2500, 30)`);

    await page.goto(`${APP}/en/dashboard`);
    await page.getByRole("link", { name: "Documents" }).first().click();
    await page.waitForURL(/\/dashboard\/documents$/);
    await main.getByText("No documents yet").waitFor({ timeout: 10000 }).catch(() => {});
    ok("dashboard: Documents in the menu, empty state", (await main.getByText("No documents yet").count()) === 1);

    await main.getByRole("link", { name: "New invoice" }).click();
    await page.waitForURL(/\/documents\/new\?type=invoice/);
    ok("editor: business details come from the profile", (await main.getByTestId("doc-business").innerText()).includes("Rue Joss, Akwa, Douala"));
    await main.getByTestId("doc-customer-select").selectOption(cust);
    ok("editor: choosing a customer fills in their details", (await main.getByLabel("Customer name").inputValue()) === "Brenda Nkeng" && (await main.getByLabel("Email").nth(0).inputValue()) === "brenda@example.com");
    await main.getByTestId("doc-catalog-select").selectOption({ label: "Robe wax — Size: XL — 16,000 FCFA" });
    await main.getByTestId("doc-catalog-select").selectOption({ label: "Retouche — 2,500 FCFA" });
    await main.getByLabel("Qty").first().fill("2");
    ok("editor: products (with variants) and services come with today's prices", (await main.getByTestId("preview-total").innerText()) === "34,500 FCFA", await main.getByTestId("preview-total").innerText());
    await main.getByTestId("doc-save").click();
    await page.waitForURL(/\/dashboard\/documents\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    const inv = page.url().split("/").pop().split("?")[0];
    ok("draft saved: no number yet, totals stored, customer linked", sql(`select status || '|' || coalesce(number, '-') || '|' || total::int || '|' || customer_id from documents where id = '${inv}'`) === `draft|-|34500|${cust}`);

    await main.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/edit$/);
    await main.getByLabel("Tax rate (%)").fill("10");
    page.once("dialog", (d) => d.accept());
    await main.getByTestId("doc-issue").click();
    await page.waitForURL(/\?issued=1/, { timeout: 15000 });
    const year = new Date().getFullYear();
    ok("issue: numbered INV-YYYY-000001, total with tax (34,500 + 10 %)", sql(`select number || '|' || status || '|' || total::int from documents where id = '${inv}'`) === `INV-${year}-000001|issued|37950`);
    ok("issued: the page says it can't be changed; no Edit button", (await main.getByText("Issued documents can't be changed.").count()) === 1 && (await main.getByRole("link", { name: "Edit" }).count()) === 0);
    const pdfRes = await page.request.get(`${APP}/en/dashboard/documents/${inv}/pdf`);
    const body = await pdfRes.body();
    writeFileSync("test-results/docs-business-invoice.pdf", body);
    ok("PDF: downloaded from the saved snapshot", pdfRes.status() === 200 && body.subarray(0, 5).toString() === "%PDF-" && (pdfRes.headers()["content-disposition"] ?? "").includes(`invoice-INV-${year}-000001.pdf`));
    const anon = await (await browser.newContext()).request.get(`${APP}/en/dashboard/documents/${inv}/pdf`, { maxRedirects: 0 });
    ok("PDF: not available without signing in", anon.status() !== 200 || !(await anon.body()).subarray(0, 5).toString().startsWith("%PDF"));

    // Duplicate → new draft → issue: the next number.
    await main.getByRole("button", { name: "Duplicate" }).click();
    await page.waitForURL(/\/edit\?duplicated=1/, { timeout: 15000 });
    page.once("dialog", (d) => d.accept());
    await main.getByTestId("doc-issue").click();
    await page.waitForURL(/\?issued=1/, { timeout: 15000 });
    const inv2 = page.url().split("/").pop().split("?")[0];
    ok("duplicate: a copy becomes INV-YYYY-000002 and points to the original", sql(`select number || '|' || duplicated_from from documents where id = '${inv2}'`) === `INV-${year}-000002|${inv}`);

    // Void the first one.
    await page.goto(`${APP}/en/dashboard/documents/${inv}`);
    await main.getByLabel("Reason").fill("Wrong size");
    await main.getByRole("button", { name: "Void document" }).click();
    await main.getByText(/Voided .*Wrong size/).waitFor({ timeout: 10000 });
    ok("void: kept, marked Void with the reason, logged", sql(`select status || '|' || void_reason from documents where id = '${inv}'`) === "voided|Wrong size" && Number(sql(`select count(*) from audit_logs where business_id = '${biz}' and action like 'document.%'`)) >= 3);

    // Quotation → accepted.
    await page.goto(`${APP}/en/dashboard/documents/new?type=quotation&customer=${cust}`);
    ok("quotation: started from a customer, details filled", (await main.getByLabel("Customer name").inputValue()) === "Brenda Nkeng");
    await main.getByLabel("Description").first().fill("Uniformes (lot de 20)");
    await main.getByLabel("Unit price").first().fill("180000");
    page.once("dialog", (d) => d.accept());
    await main.getByTestId("doc-issue").click();
    await page.waitForURL(/\?issued=1/, { timeout: 15000 });
    await main.getByRole("button", { name: "Accepted", exact: true }).click();
    await main.locator("header").getByText("Accepted").waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(800);
    ok("quotation: QUO-YYYY-000001, sent, then accepted", sql(`select number || '|' || status from documents where business_id = '${biz}' and doc_type = 'quotation'`) === `QUO-${year}-000001|accepted`);

    // Receipt (owner).
    await page.goto(`${APP}/en/dashboard/documents/new?type=receipt`);
    await main.getByTestId("doc-customer-select").selectOption(cust);
    await main.getByLabel("Description").first().fill("Acompte uniformes");
    await main.getByLabel("Unit price").first().fill("50000");
    await main.getByLabel("Payment method").selectOption("mtn_momo");
    await main.getByLabel("Payment reference (optional)").fill("MP241022.1234");
    page.once("dialog", (d) => d.accept());
    await main.getByTestId("doc-issue").click();
    await page.waitForURL(/\?issued=1/, { timeout: 15000 });
    ok("receipt: REC-YYYY-000001 with the amount received and MoMo reference", sql(`select number || '|' || amount_paid::int || '|' || payment_method || '|' || payment_reference from documents where business_id = '${biz}' and doc_type = 'receipt'`) === `REC-${year}-000001|50000|mtn_momo|MP241022.1234`);
    ok("receipt: preview says paid in full", (await main.getByTestId("document-preview").innerText()).includes("Paid in full"));

    // The customer's profile lists their documents.
    await page.goto(`${APP}/en/dashboard/customers/${cust}`);
    await main.getByTestId("customer-documents").waitFor({ timeout: 10000 });
    ok("customer profile: their invoices, quotations and receipts", (await main.getByTestId("customer-documents").locator("li").count()) === 4 && (await main.getByRole("link", { name: "New invoice" }).count()) === 1);

    // Settings: new numbering.
    await page.goto(`${APP}/en/dashboard/documents/settings`);
    await main.getByLabel("Invoice prefix").fill("fac");
    await main.getByLabel(/Include the year/).uncheck();
    await main.getByLabel("Digits").selectOption("4");
    await main.getByLabel(/Tax number \(NIU\)/).fill("M012345678901A");
    await main.getByRole("button", { name: "Save" }).click();
    await main.getByText("Settings saved.").first().waitFor({ timeout: 10000 });
    await page.goto(`${APP}/en/dashboard/documents/new?type=invoice`);
    ok("settings: the NIU is printed under the business name", (await main.getByTestId("doc-business").innerText()).includes("M012345678901A"));
    await main.getByLabel("Description").first().fill("Test");
    await main.getByLabel("Unit price").first().fill("1000");
    await main.getByLabel("Customer name").fill("Walk-in");
    page.once("dialog", (d) => d.accept());
    await main.getByTestId("doc-issue").click();
    await page.waitForURL(/\?issued=1/, { timeout: 15000 });
    ok("settings: next invoice is FAC-0001 (prefix in capitals, no year, 4 digits)", sql(`select number from documents where business_id = '${biz}' and number like 'FAC-%'`) === "FAC-0001");

    // List: search and filters.
    await page.goto(`${APP}/en/dashboard/documents?q=Brenda`);
    const brendaRows = await main.getByTestId("documents-rows").locator("tr").count();
    await page.goto(`${APP}/en/dashboard/documents?type=receipt`);
    const receiptRows = await main.getByTestId("documents-rows").locator("tr").count();
    ok("list: search by customer and filter by type", brendaRows === 4 && receiptRows === 1, `${brendaRows}, ${receiptRows}`);
    await page.screenshot({ path: "test-results/docs-business-list.png", fullPage: true });
    const labelOnDesktop = await main.getByTestId("documents-rows").locator("td").nth(1).evaluate((el) => getComputedStyle(el, "::before").content);
    ok("tables: column names beside values on phones only, not on desktop", labelOnDesktop === "none" || labelOnDesktop === "normal", labelOnDesktop);

    // Drafts can be deleted; issued documents can't.
    await page.goto(`${APP}/en/dashboard/documents/new?type=invoice`);
    await main.getByLabel("Customer name").fill("Draft only");
    await main.getByLabel("Description").first().fill("x");
    await main.getByTestId("doc-save").click();
    await page.waitForURL(/\?saved=1/, { timeout: 15000 });
    await main.getByRole("button", { name: "Delete draft" }).click();
    await main.getByRole("button", { name: "Delete" }).last().click();
    await page.waitForURL(/\/documents\?deleted=1/, { timeout: 15000 });
    ok("drafts can be deleted", sql(`select count(*) from documents where business_id = '${biz}' and customer_snapshot->>'name' = 'Draft only'`) === "0");

    // Phones.
    const phone2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const mp = await phone2.newPage();
    for (const path of ["/dashboard/documents", "/dashboard/documents/new?type=invoice", `/dashboard/documents/${inv2}`, "/dashboard/documents/settings"]) {
      await mp.goto(`${APP}/en${path}`);
      await mp.locator("main").waitFor();
      await sleep(700);
      const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`mobile: ${path.split("?")[0]} fits a 390 px screen`, over <= 0, `overflow ${over}px`);
    }
    await mp.goto(`${APP}/en/dashboard/documents`);
    const labelOnPhone = await mp.getByTestId("documents-rows").locator("td").nth(1).evaluate((el) => getComputedStyle(el, "::before").content);
    ok("tables: on phones each value shows its column name", labelOnPhone === '"Type"', labelOnPhone);
    await mp.goto(`${APP}/en/dashboard/documents/${inv2}`);
    await mp.screenshot({ path: "test-results/docs-business-mobile.png", fullPage: true });
    await phone2.close();

    // French dashboard.
    await page.goto(`${APP}/fr/dashboard/documents/${inv2}`);
    ok("French dashboard: labels translated", (await main.getByRole("link", { name: "Télécharger le PDF" }).count()) === 1);

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
    await page.screenshot({ path: "test-results/docs-failure.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log(results.join("\n"));
  }
})();
