/*
 * End-to-end test of the Stage 1 SaaS dashboard: sign-up → onboarding wizard
 * (6 steps) → products (variants, validation, search, toggle, delete) →
 * knowledge (FAQs + documents) → customers → conversation (Take Over /
 * Return to AI) → orders → empty states → tenant isolation (UI + REST) →
 * French dashboard → mobile layout. Runs against a local Supabase stack with
 * Mailpit (never production), after `npm run build && npm start`.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... node tests/e2e/dashboard.e2e.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY");
const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function latestMail(to, subjectIncludes) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json();
    const m = list.messages?.find((x) => x.Subject.includes(subjectIncludes));
    if (m) return (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    await sleep(500);
  }
  return null;
}
const linkFrom = (mail) => (mail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&");
const token = async (email, password) =>
  (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password }) })).json()).access_token;
const rest = (tok) => ({ apikey: ANON, authorization: `Bearer ${tok}`, "content-type": "application/json" });

mkdirSync("test-results", { recursive: true });

async function signUp(browser, user, locale) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: locale === "fr" ? "fr-FR" : "en-US" });
  const page = await ctx.newPage();
  await page.goto(`${APP}/${locale}/register`);
  const fr = locale === "fr";
  await page.getByLabel(fr ? "Votre nom" : "Your name").fill(user.name);
  await page.getByLabel(fr ? "Nom de l'entreprise" : "Business name").fill(user.business);
  await page.getByLabel(fr ? "E-mail" : "Email", { exact: true }).fill(user.email);
  await page.getByLabel(fr ? "Mot de passe" : "Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: fr ? "Créer mon compte" : "Create account" }).click();
  await page.getByText(fr ? "Vérifiez votre boîte mail" : "Check your email").waitFor({ timeout: 10000 });
  const mail = await latestMail(user.email, fr ? "Confirmez" : "Confirm");
  await page.goto(linkFrom(mail));
  await page.waitForURL(/\/dashboard\/onboarding/);
  return { ctx, page };
}

(async () => {
  const stamp = Date.now();
  const C = { name: "Awa Nkeng", business: "Awa Styles", email: `awa+${stamp}@example.com`, password: "Wazabolt2026" };
  const D = { name: "Jean Mballa", business: "Mballa Resto", email: `jean+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const errors = [];
  const { ctx, page } = await signUp(browser, C, "en");
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const main = page.locator("main");
  const saveContinue = () => main.getByRole("button", { name: "Save and continue" }).click();

  // ---------------------------------------------------------------- onboarding
  ok("new sign-up starts the onboarding wizard at step 1", page.url().includes("step=1") && (await page.getByText("Step 1 of 6").count()) === 1, page.url());
  await main.getByLabel("Industry").selectOption("fashion");
  await main.getByLabel("City").fill("Douala");
  await main.getByLabel("Website").fill("awastyles.cm");
  await main.getByLabel("Description").fill("Ankara dresses and accessories, made in Douala.");
  await main.getByLabel("Business email").fill("not-an-email");
  await saveContinue();
  await main.getByText("Enter a valid email address.").waitFor({ timeout: 10000 });
  ok("profile validation error shown, typed values kept", (await main.getByLabel("City").inputValue()) === "Douala");
  await main.getByLabel("Business email").fill("hello@awastyles.cm");
  await saveContinue();
  await page.waitForURL(/step=2/);
  ok("step 1 saved → step 2 (opening hours)", (await page.getByText("Step 2 of 6").count()) === 1);
  await main.getByRole("checkbox", { name: "Closed" }).last().check();
  await main.getByLabel("Saturday — Closes").fill("15:00");
  await saveContinue();
  await page.waitForURL(/step=3/);
  ok("step 2 saved → step 3 (products)", true);
  await main.getByLabel("Name").fill("Ankara dress");
  await main.getByLabel("Price (XAF)").fill("15 000");
  await main.getByLabel("Stock quantity").fill("3");
  await main.getByRole("button", { name: "Add a product" }).click();
  await main.getByText("1 products added").waitFor({ timeout: 10000 });
  ok("quick product added during onboarding", (await main.getByText("15,000 XAF").count()) >= 1);
  await saveContinue();
  await page.waitForURL(/step=4/);
  await main.getByLabel("Question").fill("Do you deliver in Douala?");
  await main.getByLabel("Answer", { exact: true }).fill("Yes, delivery in Douala costs 1,000 XAF and takes 24 hours.");
  await main.getByRole("button", { name: "Add an FAQ" }).click();
  await main.getByText("1 FAQs added").waitFor({ timeout: 10000 });
  ok("quick FAQ added during onboarding", true);
  await saveContinue();
  await page.waitForURL(/step=5/);
  await main.getByText("Casual", { exact: true }).click();
  await main.getByText("Detailed", { exact: true }).click();
  await main.getByText("French", { exact: true }).click();
  await saveContinue();
  await page.waitForURL(/step=6/);
  ok("WhatsApp step shows the real (not connected) state, not a fake connection",
    (await main.getByText("Connect your number on the WhatsApp page").count()) === 1 && (await main.getByText("Not Connected").count()) === 1);
  await main.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/\/en\/dashboard\?onboarded=1/);
  await page.getByRole("heading", { name: /Welcome, Awa/ }).waitFor({ timeout: 15000 });
  ok("finishing onboarding lands on the dashboard", (await page.getByText("Welcome, Awa").count()) === 1);
  const cTok = await token(C.email, C.password);
  const [biz] = await (await fetch(`${SUPABASE}/rest/v1/businesses?select=id,industry,city,website,opening_hours,onboarding_completed_at`, { headers: rest(cTok) })).json();
  ok("onboarding saved business profile + hours", biz.industry === "fashion" && biz.city === "Douala" && biz.website === "https://awastyles.cm" && biz.opening_hours.sun.closed === true && biz.opening_hours.sat.close === "15:00" && !!biz.onboarding_completed_at, JSON.stringify(biz));
  const [ai] = await (await fetch(`${SUPABASE}/rest/v1/ai_settings?select=tone,reply_length,language_mode`, { headers: rest(cTok) })).json();
  const [lang] = await (await fetch(`${SUPABASE}/rest/v1/businesses?select=default_language`, { headers: rest(cTok) })).json();
  ok("onboarding saved AI personality (casual / detailed / French only)", ai.tone === "casual" && ai.reply_length === "detailed" && ai.language_mode === "fixed" && lang.default_language === "fr", JSON.stringify({ ai, lang }));
  ok("dashboard metrics are real (1 product → 0 orders, no fake AI rate)",
    (await main.getByText("No data yet").count()) >= 1 && !(await main.innerText()).includes("%"));
  await page.screenshot({ path: "test-results/stage1-dashboard.png", fullPage: true });

  // ------------------------------------------------------------------ products
  await page.goto(`${APP}/en/dashboard/products/new`);
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("Please check the highlighted fields.").waitFor({ timeout: 10000 });
  ok("empty product shows field errors", (await main.getByText("This field is required.").count()) >= 1);
  await main.getByLabel("Name").fill("Wax print shirt");
  await main.getByLabel("Price (XAF)").fill("8500");
  await main.getByLabel("SKU / reference").fill("WAX-01");
  await main.getByLabel("Category").fill("Shirts");
  await main.getByRole("button", { name: "Add variant" }).click();
  await main.getByLabel("Option").first().fill("Size");
  await main.getByLabel("Value", { exact: true }).first().fill("M");
  await main.getByLabel("Stock", { exact: true }).first().fill("4");
  await main.getByRole("button", { name: "Add variant" }).click();
  await main.getByLabel("Value", { exact: true }).nth(1).fill("XL");
  await main.getByLabel("Price +/−").nth(1).fill("500");
  await main.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/dashboard\/products\/[0-9a-f-]{36}\?saved=1/);
  const productId = page.url().match(/products\/([0-9a-f-]{36})/)[1];
  ok("product with 2 variants created", (await main.getByLabel("Value", { exact: true }).count()) === 2 && (await main.getByLabel("Value", { exact: true }).nth(1).inputValue()) === "XL");
  await page.goto(`${APP}/en/dashboard/products/${productId}`);
  await main.getByLabel("Price (XAF)").fill("9000");
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("Product saved.").waitFor({ timeout: 10000 });
  const [prod] = await (await fetch(`${SUPABASE}/rest/v1/products?id=eq.${productId}&select=price,sku,product_variants(value,price_modifier)`, { headers: rest(cTok) })).json();
  ok("product edit persisted (price 9000, variants kept)", Number(prod.price) === 9000 && prod.product_variants.length === 2, JSON.stringify(prod));
  // Image upload: saved with the photo, or — when the stack has no Storage service — a clear, honest error; the product is saved either way.
  await main.locator('input[type="file"]').setInputFiles({ name: "shirt.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex") });
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText(/image couldn't be uploaded|wasn't accepted|Product saved/).first().waitFor({ timeout: 10000 });
  ok("image upload failure is reported, not hidden", (await main.getByText(/image couldn't be uploaded|Product saved/).count()) >= 1);
  // Duplicate SKU
  await page.goto(`${APP}/en/dashboard/products/new`);
  await main.getByLabel("Name").fill("Copy");
  await main.getByLabel("Price (XAF)").fill("1");
  await main.getByLabel("SKU / reference").fill("wax-01");
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("Another product already uses this SKU.").waitFor({ timeout: 10000 });
  ok("duplicate SKU (case-insensitive) refused", true);
  // List, search, filter, toggle
  await page.goto(`${APP}/en/dashboard/products?q=wax`);
  ok("product search", (await main.getByRole("link", { name: /Wax print shirt/ }).count()) === 1 && (await main.getByText("Ankara dress").count()) === 0);
  await page.goto(`${APP}/en/dashboard/products?stock=low`);
  await main.getByText("Ankara dress").first().waitFor({ timeout: 10000 }).catch(() => {});
  ok("low-stock filter", (await main.getByText("Ankara dress").count()) === 1 && (await main.getByText("Wax print shirt").count()) === 0);
  await page.goto(`${APP}/en/dashboard/products`);
  const row = main.getByRole("row", { name: /Wax print shirt/ });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await row.getByText("Inactive").waitFor({ timeout: 10000 });
  ok("product deactivated from the list", true);
  await page.screenshot({ path: "test-results/stage1-products.png", fullPage: true });

  // ----------------------------------------------------------------- knowledge
  await page.goto(`${APP}/en/dashboard/knowledge?tab=documents`);
  ok("documents tab empty state", (await main.getByText("No business information yet").count()) === 1);
  await main.getByRole("link", { name: "New document" }).first().click();
  await main.getByLabel("Title").fill("Delivery policy");
  await main.getByLabel("Type").selectOption("delivery");
  await main.getByLabel("Content").fill("Douala: 1,000 XAF, 24h. Yaoundé: 2,500 XAF, 48h.");
  await main.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/tab=documents&saved=1/);
  ok("document created", (await main.getByRole("link", { name: "Delivery policy" }).count()) === 1);
  await main.getByRole("button", { name: "Deactivate" }).click();
  await main.getByText("Inactive").waitFor({ timeout: 10000 });
  ok("document deactivated", true);
  await page.goto(`${APP}/en/dashboard/knowledge?tab=faqs`);
  await main.getByRole("link", { name: "Do you deliver in Douala?" }).click();
  await main.getByLabel("Priority").fill("90");
  await main.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/tab=faqs&saved=1/);
  ok("FAQ edited", (await main.getByText("Priority: 90").count()) === 1);
  await page.goto(`${APP}/en/dashboard/knowledge/faqs/new`);
  await main.getByLabel("Question").fill("Temp question");
  await main.getByLabel("Answer", { exact: true }).fill("Temp answer");
  await main.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/tab=faqs&saved=1/);
  const tempRow = main.getByRole("listitem").filter({ hasText: "Temp question" });
  await tempRow.getByRole("button", { name: "Delete" }).click();
  await tempRow.getByRole("button", { name: "Yes, delete" }).click();
  await main.getByText("Temp question").waitFor({ state: "detached", timeout: 10000 });
  ok("FAQ deleted after confirmation", true);

  // ----------------------------------------------------------------- customers
  await page.goto(`${APP}/en/dashboard/customers`);
  ok("customers empty state", await main.getByText("No customers yet").waitFor({ timeout: 15000 }).then(() => true, () => false));
  await page.goto(`${APP}/en/dashboard/customers/new`);
  await main.getByLabel("Name").fill("Brenda Fon");
  await main.getByLabel("WhatsApp number").fill("6 70 00 00 01");
  await main.getByLabel("City").fill("Buea");
  await main.getByLabel("Preferred language").selectOption("wes");
  await main.getByLabel("Tags").fill("VIP, wholesale");
  await main.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/dashboard\/customers\/[0-9a-f-]{36}\?saved=1/);
  const customerId = page.url().match(/customers\/([0-9a-f-]{36})/)[1];
  ok("customer created with normalised number", (await main.getByText("+237670000001").count()) >= 1);
  await page.goto(`${APP}/en/dashboard/customers/new`);
  await main.getByLabel("WhatsApp number").fill("+237 670 000 001");
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("A customer with this WhatsApp number already exists.").waitFor({ timeout: 10000 });
  ok("duplicate customer refused", true);
  await page.goto(`${APP}/en/dashboard/customers?tag=vip`);
  ok("customer tag filter", (await main.getByRole("link", { name: "Brenda Fon" }).count()) === 1);

  // -------------------------------------------------------------- conversations
  await page.goto(`${APP}/en/dashboard/conversations`);
  ok("conversations empty state explains WhatsApp is next stage", (await main.getByText("No conversations yet").count()) === 1);
  await page.goto(`${APP}/en/dashboard/customers/${customerId}`);
  await main.getByRole("button", { name: "Open conversation" }).click();
  await page.waitForURL(/\/dashboard\/conversations\/[0-9a-f-]{36}$/);
  await main.getByRole("button", { name: "Take Over" }).waitFor({ timeout: 15000 });
  const convId = page.url().match(/conversations\/([0-9a-f-]{36})/)[1];
  ok("conversation created from the customer profile", (await main.getByText("AI Online").count()) >= 1 && (await main.getByText("No messages yet.").count()) === 1);
  ok("composer is disabled until WhatsApp is connected", (await main.getByText("Connect your WhatsApp number to reply from WazaBolt.").count()) === 1 && (await main.locator("textarea").count()) === 0);
  await main.getByRole("button", { name: "Take Over" }).click();
  await main.getByRole("button", { name: "Return to AI" }).waitFor({ timeout: 10000 });
  let [conv] = await (await fetch(`${SUPABASE}/rest/v1/conversations?id=eq.${convId}&select=ai_enabled,assigned_to`, { headers: rest(cTok) })).json();
  ok("Take Over → Human Mode (ai_enabled=false, assigned)", conv.ai_enabled === false && !!conv.assigned_to && (await main.getByText("Human Mode").count()) >= 1, JSON.stringify(conv));
  await main.getByRole("button", { name: "Return to AI" }).click();
  await main.getByRole("button", { name: "Take Over" }).waitFor({ timeout: 10000 });
  [conv] = await (await fetch(`${SUPABASE}/rest/v1/conversations?id=eq.${convId}&select=ai_enabled`, { headers: rest(cTok) })).json();
  ok("Return to AI → AI Online (ai_enabled=true)", conv.ai_enabled === true);
  await main.getByLabel("Status").first().selectOption("pending");
  await sleep(1500);
  [conv] = await (await fetch(`${SUPABASE}/rest/v1/conversations?id=eq.${convId}&select=status`, { headers: rest(cTok) })).json();
  ok("conversation status changed", conv.status === "pending", JSON.stringify(conv));
  const audit = await (await fetch(`${SUPABASE}/rest/v1/audit_logs?select=action&action=in.(conversation.taken_over,conversation.returned_to_ai)`, { headers: rest(cTok) })).json();
  ok("takeover and return are audit-logged", Array.isArray(audit) && audit.length >= 2, JSON.stringify(audit));
  await page.screenshot({ path: "test-results/stage1-conversation.png", fullPage: true });

  // ---------------------------------------------------------------------- orders
  await page.goto(`${APP}/en/dashboard/orders/new?customer=${customerId}&conversation=${convId}`);
  await main.getByRole("button", { name: "New order" }).click();
  await main.getByText("Add at least one item.").waitFor({ timeout: 10000 });
  ok("order without items refused", true);
  await main.getByRole("button", { name: "Add product" }).click();
  // Only active products are sellable: the deactivated shirt must not be offered.
  ok("inactive products are not offered in orders", (await main.getByLabel("Product", { exact: true }).locator("option").allInnerTexts()).every((o) => !o.includes("Wax print shirt")));
  await main.getByLabel("Product", { exact: true }).selectOption({ label: "Ankara dress — 15,000 XAF" });
  await main.getByLabel("Qty").first().fill("2");
  await main.getByRole("button", { name: "Add custom item" }).click();
  await main.getByLabel("Description").fill("Tailoring");
  await main.getByLabel("Unit price").fill("3000");
  await main.getByLabel("Delivery fee").fill("1000");
  await main.getByLabel("Payment method").selectOption("orange_money");
  await main.getByRole("button", { name: "New order" }).click();
  await page.waitForURL(/\/dashboard\/orders\/[0-9a-f-]{36}\?saved=1/);
  await main.getByRole("heading", { name: "ORD-00001" }).waitFor({ timeout: 15000 });
  const orderText = await main.innerText();
  const [order] = await (await fetch(`${SUPABASE}/rest/v1/orders?select=order_number,subtotal,delivery_fee,total,conversation_id,order_items(product_name,quantity,unit_price)`, { headers: rest(cTok) })).json();
  const expected = order.order_items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  ok("order created with server-side totals", order.order_number === "ORD-00001" && Number(order.subtotal) === expected && Number(order.total) === expected + 1000 && order.conversation_id === convId, JSON.stringify(order));
  ok("order page shows number and total", orderText.includes("ORD-00001") && orderText.includes("Tailoring"));
  await main.getByLabel("Order status").selectOption("confirmed");
  await main.getByLabel("Payment status").selectOption("paid");
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("Order updated.").waitFor({ timeout: 10000 });
  ok("order status + payment updated", true);
  await page.screenshot({ path: "test-results/stage1-order.png", fullPage: true });

  // ------------------------------------------------ AI, analytics, WhatsApp, billing, team
  await page.goto(`${APP}/en/dashboard/ai`);
  ok("AI settings reflect onboarding choices", await main.getByRole("radio", { name: "Casual" }).isChecked());
  await main.getByRole("radio", { name: "Send an after-hours message" }).check();
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("This field is required.").waitFor({ timeout: 10000 });
  ok("after-hours message required when that mode is chosen", true);
  await main.getByRole("textbox", { name: "After-hours message" }).fill("We're closed — we reply at 8:00.");
  await main.getByRole("textbox", { name: "Greeting" }).fill("Welcome to Awa Styles!");
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("AI settings saved.").waitFor({ timeout: 10000 });
  ok("AI settings saved", true);
  await page.goto(`${APP}/en/dashboard/analytics`);
  ok("analytics shows real counts and no invented AI figures", (await main.getByText("No data yet").count()) >= 2 && (await main.getByText("Most ordered products").count()) === 1);
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  ok("WhatsApp page: Not Connected, with the connect form (no fake connection)", (await main.getByText("Not Connected").count()) === 1 && (await main.getByLabel("Phone Number ID").count()) === 1);
  await page.goto(`${APP}/en/dashboard/billing`);
  await main.getByText("Current plan").first().waitFor({ timeout: 10000 }).catch(() => {});
  ok("billing shows plans from the database, Free is current", (await main.locator("li").getByText("Business", { exact: true }).count()) === 1 && (await main.locator("li").getByText("25,000 XAF").count()) === 1 && (await main.getByText("Current plan").count()) >= 1);
  await page.goto(`${APP}/en/dashboard/team`);
  await main.getByText("You", { exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
  ok("team lists the owner", (await main.getByText("You", { exact: true }).count()) === 1 && (await main.getByText("Owner").count()) >= 1);
  await page.goto(`${APP}/en/dashboard/automations`);
  ok("automations is an honest coming-soon page", (await main.getByText("Coming soon").count()) === 1);
  await page.goto(`${APP}/en/dashboard/settings/languages`);
  ok("old languages URL redirects to AI Assistant", page.url().endsWith("/en/dashboard/ai/languages"), page.url());

  // ------------------------------------------------------------ tenant isolation
  const { ctx: ctxD, page: pd } = await signUp(browser, D, "fr");
  pd.on("pageerror", (e) => errors.push(String(e)));
  await pd.goto(`${APP}/fr/dashboard/products`);
  ok("tenant D sees the French empty products page", (await pd.getByRole("heading", { name: "Produits", level: 1 }).count()) === 1 && (await pd.getByText("Aucun produit").count()) === 1);
  // Streamed dashboard pages render the 404 UI (a 404 status only when nothing has streamed yet).
  await pd.goto(`${APP}/fr/dashboard/products/${productId}`);
  await pd.getByText("Erreur 404").waitFor({ timeout: 15000 });
  ok("tenant D gets the not-found page for C's product", !(await pd.content()).includes("Wax print shirt"));
  await pd.goto(`${APP}/fr/dashboard/conversations/${convId}`);
  await pd.getByText("Erreur 404").waitFor({ timeout: 15000 });
  ok("tenant D gets the not-found page for C's conversation", !(await pd.content()).includes("Brenda"));
  const dTok = await token(D.email, D.password);
  for (const table of ["products", "faqs", "knowledge_documents", "customers", "conversations", "orders", "order_items", "product_variants"]) {
    const rows = await (await fetch(`${SUPABASE}/rest/v1/${table}?select=*`, { headers: rest(dTok) })).json();
    ok(`REST: D sees none of C's ${table}`, Array.isArray(rows) && rows.length === 0, JSON.stringify(rows).slice(0, 120));
  }
  const ins = await fetch(`${SUPABASE}/rest/v1/products`, { method: "POST", headers: rest(dTok), body: JSON.stringify({ business_id: biz.id, name: "Injected", price: 1 }) });
  ok("REST: D cannot insert into C's catalog", ins.status === 403 || ins.status === 401, String(ins.status));
  const upd = await (await fetch(`${SUPABASE}/rest/v1/conversations?id=eq.${convId}`, { method: "PATCH", headers: { ...rest(dTok), prefer: "return=representation" }, body: JSON.stringify({ ai_enabled: false }) })).json();
  ok("REST: D cannot take over C's conversation", Array.isArray(upd) && upd.length === 0, JSON.stringify(upd));
  const rpc = await fetch(`${SUPABASE}/rest/v1/rpc/create_order`, { method: "POST", headers: rest(dTok), body: JSON.stringify({ p_business_id: biz.id, p_customer_id: customerId, p_items: [{ name: "x", unit_price: 1, quantity: 1 }] }) });
  ok("RPC: D cannot create an order for C", rpc.status >= 400, String(rpc.status));
  await ctxD.close();

  // ------------------------------------------------------------ viewer / logout
  await page.goto(`${APP}/en/dashboard`);
  await page.locator("aside").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/en\/login/);
  const prot = await page.goto(`${APP}/en/dashboard/orders`);
  ok("protected route after logout redirects to login", page.url().includes("/en/login?next=%2Fen%2Fdashboard%2Forders"), `${prot.status()} ${page.url()}`);

  // ------------------------------------------------------------- mobile layout
  const mctx = await browser.newContext({ locale: "en-US" });
  const mp = await mctx.newPage();
  await mp.goto(`${APP}/en/login`);
  await mp.getByLabel("Email", { exact: true }).fill(C.email);
  await mp.getByLabel("Password", { exact: true }).fill(C.password);
  await mp.getByRole("button", { name: "Log in" }).click();
  await mp.waitForURL(/\/en\/dashboard/);
  const pages = ["/dashboard", "/dashboard/conversations", `/dashboard/conversations/${convId}`, "/dashboard/customers", `/dashboard/customers/${customerId}`, "/dashboard/products", `/dashboard/products/${productId}`, "/dashboard/orders", "/dashboard/orders/new", "/dashboard/knowledge", "/dashboard/ai", "/dashboard/ai/languages", "/dashboard/ai/test", "/dashboard/analytics", "/dashboard/whatsapp", "/dashboard/team", "/dashboard/billing", "/dashboard/settings", "/dashboard/onboarding?step=2"];
  for (const width of [390, 768, 1024, 1440]) {
    await mp.setViewportSize({ width, height: 900 });
    const overflow = [];
    for (const p of pages) {
      await mp.goto(`${APP}/en${p}`);
      const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) overflow.push(`${p} (+${over}px)`);
    }
    ok(`no horizontal overflow at ${width}px on ${pages.length} dashboard pages`, overflow.length === 0, overflow.join(", "));
  }
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.goto(`${APP}/en/dashboard/conversations/${convId}`);
  await mp.screenshot({ path: "test-results/stage1-mobile-conversation.png", fullPage: true });
  await mp.goto(`${APP}/en/dashboard/products`);
  await mp.screenshot({ path: "test-results/stage1-mobile-products.png", fullPage: true });
  await mctx.close();

  ok("no browser errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  await ctx.close();
  await browser.close();
})().catch((e) => {
  console.log(results.join("\n"));
  console.error("CRASH", e.message);
  process.exit(1);
});
