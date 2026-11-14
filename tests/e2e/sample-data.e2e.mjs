/*
 * Sample data in a new workspace: seeded on creation (a few items, two
 * WhatsApp chats — one waiting for a person —, three FAQ templates) in the
 * workspace's currency and language, labelled "Sample", kept out of real work
 * (public shop page, sales, orders, sending, plan counts), and cleared by the
 * owner only — deleting nothing else.
 *
 *   APP_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... node tests/e2e/sample-data.e2e.mjs
 */
import { execFileSync } from "node:child_process";

import { chromium } from "./playwright.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.DATABASE_URL;
if (!ANON || !DB || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim();
const sqlError = (q) => {
  try {
    sql(q);
    return "";
  } catch (e) {
    return String(e.stderr ?? e.message);
  }
};
async function latestMail(to, subjectIncludes) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json();
    const m = list.messages?.find((x) => x.Subject.includes(subjectIncludes));
    if (m) return (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    await sleep(500);
  }
  return null;
}
const linkFrom = (mail) => (mail?.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&");
const token = async (email, password) =>
  (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password }) })).json()).access_token;
const rest = (tok) => ({ apikey: ANON, authorization: `Bearer ${tok}`, "content-type": "application/json", prefer: "return=representation" });

/** Sign up from the home page's tab, then the one-screen setup. */
async function signUp(browser, u) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: u.lang === "fr" ? "fr-FR" : "en-US" });
  const page = await ctx.newPage();
  const fr = u.lang === "fr";
  await page.goto(`${APP}/${u.lang}/register?vertical=${u.vertical}`);
  await page.getByLabel(fr ? "Votre nom" : "Your name").fill(u.name);
  await page.getByLabel(fr ? "E-mail" : "Email", { exact: true }).fill(u.email);
  await page.getByLabel(fr ? "Mot de passe" : "Password", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: fr ? "Créer mon compte" : "Create account" }).click();
  await page.getByText(fr ? "Vérifiez votre boîte mail" : "Check your email").waitFor({ timeout: 10000 });
  await page.goto(linkFrom(await latestMail(u.email, fr ? "Confirmez" : "Confirm")));
  await page.waitForURL(/\/dashboard\/setup/, { timeout: 15000 });
  await page.locator('input[name="name"]').fill(u.business);
  if (u.country) await page.getByTestId("setup-currency").selectOption(u.country);
  await page.getByRole("button", { name: fr ? "Créer mon espace" : "Create my workspace" }).click();
  await page.waitForURL(/\/dashboard(\/school)?(\?|$)/, { timeout: 15000 });
  const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${u.email}' and m.role = 'owner'`);
  return { ctx, page, biz };
}

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  const errors = [];
  try {
    // ---------------------------------------------------------------- a shop in Nigeria: seeded in naira
    const O = { name: "Ada Obi", business: `Ada Styles ${stamp}`, email: `sample-owner+${stamp}@example.com`, password: "Wazabolt2026", lang: "en", vertical: "shop", country: "NG" };
    const { ctx, page, biz } = await signUp(browser, O);
    page.on("pageerror", (e) => errors.push(String(e)));
    const count = (table, extra = "") => Number(sql(`select count(*) from ${table} where business_id = '${biz}' and is_sample ${extra}`));
    ok(
      "a new shop is seeded: 5 sample products, 2 chats (1 waiting for a person), 2 sample customers, 3 FAQ templates",
      count("products") === 5 && count("conversations") === 2 && count("conversations", "and human_requested and not ai_enabled") === 1 && count("customers") === 2 && count("faqs") === 3,
    );
    ok("…priced in naira, in the shop's currency", sql(`select string_agg(distinct currency, ',') from products where business_id = '${biz}'`) === "NGN" && sql(`select price::int from products where business_id = '${biz}' and name = 'Wax print dress'`) === "39000");
    ok("…the FAQ templates speak naira too", sql(`select answer from faqs where business_id = '${biz}' and question = 'Do you deliver?'`).includes("2,600 NGN"));
    ok("…the sample customers' numbers can't be dialled (234 then 0…)", sql(`select string_agg(whatsapp_phone, ',' order by whatsapp_phone) from customers where business_id = '${biz}'`) === "234000000001,234000000002");
    const ownerTok = await token(O.email, O.password);
    const [limits] = await (await fetch(`${SUPABASE}/rest/v1/rpc/business_plan_limits`, { method: "POST", headers: rest(ownerTok), body: JSON.stringify({ p_business_id: biz }) })).json();
    ok("…no orders, and the samples don't count against the plan (0 products used)", Number(sql(`select count(*) from orders where business_id = '${biz}'`)) === 0 && limits?.products_used === 0, JSON.stringify(limits));

    // ---------------------------------------------------------------- the banner and the labels
    await page.goto(`${APP}/en/dashboard`);
    const banner = page.getByTestId("sample-data-banner");
    await banner.waitFor({ timeout: 15000 });
    ok("dashboard: the sample-data banner, with Clear sample data for the owner", (await banner.getByRole("button", { name: "Clear sample data" }).count()) === 1 && /It's not real/.test(await banner.innerText()));
    await page.goto(`${APP}/en/dashboard/products`);
    ok("products: the sample items are labelled Sample", (await page.locator("main").getByTestId("sample-badge").count()) === 5);
    await page.goto(`${APP}/en/dashboard/conversations`);
    ok("conversations: two sample chats, one in the queue asking for a person", (await page.locator("main").getByTestId("sample-badge").count()) === 2 && (await page.locator("main").getByText("Customer asked for a person").count()) >= 1);
    const handoffId = sql(`select id from conversations where business_id = '${biz}' and is_sample and human_requested`);
    await page.goto(`${APP}/en/dashboard/conversations/${handoffId}`);
    await page.getByText(/replies to it are never sent/).waitFor({ timeout: 15000 }).catch(() => {});
    ok("a sample chat: no reply box, a note that nothing is sent", (await page.getByText(/replies to it are never sent/).count()) === 1 && (await page.locator('textarea[name="text"]').count()) === 0);

    // ---------------------------------------------------------------- the walls
    const realCustomer = sql(`insert into customers (business_id, whatsapp_phone, name) values ('${biz}', '2348031234567', 'Real Customer') returning id`).split("\n")[0];
    const sampleCustomer = sql(`select id from customers where business_id = '${biz}' and is_sample limit 1`);
    const sampleProduct = sql(`select id from products where business_id = '${biz}' and is_sample limit 1`);
    ok("no order for a sample customer (WB490)", /WB490|sample customer/.test(sqlError(`insert into orders (business_id, customer_id, order_number) values ('${biz}', '${sampleCustomer}', 'T-${stamp}')`)));
    const realOrder = sql(`insert into orders (business_id, customer_id, order_number) values ('${biz}', '${realCustomer}', 'R-${stamp}') returning id`).split("\n")[0];
    ok("no sale of a sample product (WB491)", /WB491|sample product/.test(sqlError(`insert into order_items (business_id, order_id, product_id, product_name, quantity, unit_price, total) values ('${biz}', '${realOrder}', '${sampleProduct}', 'x', 1, 100, 100)`)));
    const tok = await token(O.email, O.password);
    const markReal = await fetch(`${SUPABASE}/rest/v1/customers?id=eq.${realCustomer}`, { method: "PATCH", headers: rest(tok), body: JSON.stringify({ is_sample: true }) });
    const newSample = await fetch(`${SUPABASE}/rest/v1/faqs`, { method: "POST", headers: rest(tok), body: JSON.stringify({ business_id: biz, question: "Q", answer: "A", is_sample: true }) });
    ok("from the app nobody can mark real data as sample (so Clear can never delete it)", !markReal.ok && !newSample.ok && sql(`select is_sample from customers where id = '${realCustomer}'`) === "f", `${markReal.status} ${newSample.status}`);
    sql(`update businesses set shop_enabled = true where id = '${biz}'`);
    sql(`insert into products (business_id, name, price, currency) values ('${biz}', 'Real Kaftan', 20000, 'NGN')`);
    const slug = sql(`select slug from businesses where id = '${biz}'`);
    const shopHtml = await (await fetch(`${APP}/s/${slug}`)).text();
    ok("the public shop page shows the real product only, never a sample", shopHtml.includes("Real Kaftan") && !shopHtml.includes("Wax print dress") && !shopHtml.includes("Rice, 5 kg bag"));
    await page.goto(`${APP}/en/dashboard/sales/new`);
    await page.getByPlaceholder("Search products by name or SKU").waitFor({ timeout: 15000 });
    ok("the till offers real products only", (await page.getByRole("button", { name: /^Real Kaftan —/ }).count()) === 1 && (await page.getByRole("button", { name: /^Wax print dress —/ }).count()) === 0);

    // ---------------------------------------------------------------- a sample item edited becomes the shop's own
    const dress = sql(`select id from products where business_id = '${biz}' and name = 'Wax print dress'`);
    await page.goto(`${APP}/en/dashboard/products/${dress}`);
    await page.locator("main").getByRole("button", { name: "Save" }).first().click();
    for (let i = 0; i < 40 && sql(`select is_sample from products where id = '${dress}'`) !== "f"; i++) await sleep(250);
    ok("saving a sample product makes it the shop's own (kept when clearing)", sql(`select is_sample from products where id = '${dress}'`) === "f");

    // ---------------------------------------------------------------- a manager: sees the banner, can't clear
    const M = { email: `sample-manager+${stamp}@example.com`, password: "Wazabolt2026" };
    const created = await (
      await fetch(`${SUPABASE}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
        body: JSON.stringify({ email: M.email, password: M.password, email_confirm: true, user_metadata: { full_name: "Mo Manager", setup: "later" } }),
      })
    ).json();
    sql(`insert into business_members (business_id, user_id, role) values ('${biz}', '${created.id}', 'admin')`);
    const mctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const mp = await mctx.newPage();
    await mp.goto(`${APP}/en/login`);
    await mp.getByLabel("Email", { exact: true }).fill(M.email);
    await mp.getByLabel("Password", { exact: true }).fill(M.password);
    await mp.getByRole("button", { name: "Log in" }).click();
    await mp.waitForURL(/\/en\/dashboard/, { timeout: 15000 });
    await mp.getByTestId("sample-data-banner").waitFor({ timeout: 15000 });
    ok("a manager sees the banner (the owner can clear it), with no Clear button", (await mp.getByTestId("sample-data-banner").getByRole("button", { name: "Clear sample data" }).count()) === 0 && /The owner can clear it/.test(await mp.getByTestId("sample-data-banner").innerText()));
    const mtok = await token(M.email, M.password);
    const mClear = await fetch(`${SUPABASE}/rest/v1/rpc/clear_sample_data`, { method: "POST", headers: rest(mtok), body: JSON.stringify({ p_business_id: biz }) });
    ok("…and the database refuses a manager's clear", !mClear.ok && count("products") === 4, String(mClear.status));
    await mp.getByTestId("sample-data-banner").getByRole("button", { name: "Hide" }).click();
    await mp.getByTestId("sample-data-banner").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    ok("Hide: the banner goes for this person (the sample data stays)", (await mp.getByTestId("sample-data-banner").count()) === 0 && count("products") === 4);
    await mctx.close();

    // ---------------------------------------------------------------- another business can't clear this one's samples
    const other = await signUp(browser, { name: "Ben Eze", business: `Ben Shop ${stamp}`, email: `sample-other+${stamp}@example.com`, password: "Wazabolt2026", lang: "en", vertical: "shop", country: "NG" });
    const otok = await token(`sample-other+${stamp}@example.com`, "Wazabolt2026");
    const cross = await fetch(`${SUPABASE}/rest/v1/rpc/clear_sample_data`, { method: "POST", headers: rest(otok), body: JSON.stringify({ p_business_id: biz }) });
    ok("another business's owner can't clear this business's samples", !cross.ok && count("products") === 4, String(cross.status));
    await other.ctx.close();

    // ---------------------------------------------------------------- the owner clears: only samples go
    await page.goto(`${APP}/en/dashboard`);
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("sample-data-banner").getByRole("button", { name: "Clear sample data" }).click();
    await page.getByTestId("sample-data-banner").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const left = ["products", "customers", "conversations", "faqs"].map((t) => count(t)).join(",");
    ok("Clear sample data: every sample row gone, the banner too", left === "0,0,0,0" && (await page.getByTestId("sample-data-banner").count()) === 0, left);
    ok(
      "…and nothing real was touched: the adopted dress, the real product, customer and order are kept",
      sql(`select string_agg(name, ',' order by name) from products where business_id = '${biz}'`) === "Real Kaftan,Wax print dress" && sql(`select count(*) from customers where id = '${realCustomer}'`) === "1" && sql(`select count(*) from orders where id = '${realOrder}'`) === "1",
    );
    ok("the clear is in the audit log", sql(`select metadata ->> 'products' from audit_logs where business_id = '${biz}' and action = 'sample_data.cleared'`) === "4");
    await ctx.close();

    // ---------------------------------------------------------------- a French school: subjects, in French, FCFA
    const S = { name: "Marie Ngo", business: `Collège ${stamp}`, email: `sample-school+${stamp}@example.com`, password: "Wazabolt2026", lang: "fr", vertical: "school" };
    const school = await signUp(browser, S);
    ok(
      "a school is seeded with 5 subjects, 2 chats with parents (1 waiting), 3 FAQ templates in French and FCFA — no products",
      sql(`select count(*) from school_subjects where business_id = '${school.biz}' and is_sample`) === "5" && sql(`select count(*) from products where business_id = '${school.biz}'`) === "0" && sql(`select count(*) from conversations where business_id = '${school.biz}' and is_sample and human_requested`) === "1" && sql(`select answer from faqs where business_id = '${school.biz}' and question like 'Combien coûtent%'`).includes("50 000 FCFA"),
    );
    await school.page.getByTestId("sample-data-banner").waitFor({ timeout: 15000 });
    ok("…with the school's banner, in French", /quelques matières/.test(await school.page.getByTestId("sample-data-banner").innerText()));
    await school.ctx.close();

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
