/*
 * End-to-end test of colour and size options: the product page (options,
 * swatches, a photo per colour, the combination grid), the till and the order
 * form (colour, then size; sold-out combinations greyed out), receipts, and
 * the WhatsApp assistant (colours in a size from real stock, the colour's
 * photo, ordering the exact combination) — against the local stack, the fake
 * Graph API (4010) and the scripted fake Anthropic API (4020).
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... WHATSAPP_APP_SECRET=... npm run test:e2e:product-options
 */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { startFakeAnthropic } from "./fake-anthropic.mjs";
import { FAKE, startFakeGraph } from "./fake-graph.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB = process.env.DATABASE_URL;
const SECRET = process.env.WHATSAPP_APP_SECRET;
if (!ANON || !DB || !SECRET) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL and WHATSAPP_APP_SECRET");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim();
async function waitFor(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  return null;
}
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

let seq = 0;
async function deliver(body, from = "237670000456", name = "Brenda") {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: FAKE.wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "237699000001", phone_number_id: FAKE.phoneNumberId },
              contacts: [{ wa_id: from, profile: { name } }],
              messages: [{ from, id: `wamid.OPT${Date.now()}${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  await fetch(`${APP}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex") },
    body: raw,
  });
}

// A tiny red PNG for the "Red" colour photo.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077" + "53de0000000c4944415408d763f8cfc0000003010100c9fe92ef0000000049454e44ae426082", "hex");

mkdirSync("test-results", { recursive: true });

(async () => {
  const graph = await startFakeGraph(4010);
  const claude = await startFakeAnthropic(4020);
  const stamp = Date.now();
  const OWNER = { name: "Ngo Bisse", business: "Waza Polos", email: `opt-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  try {
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
    sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now(), free_limits_from = '2099-12-31' where id = '${biz}'`);
    const stock = (colour, size) => sql(`select coalesce(v.stock_quantity::text, 'null') from product_variants v join products p on p.id = v.product_id where p.business_id = '${biz}' and v.options = '{"Colour":"${colour}","Size":"${size}"}'`);

    // ------------------------------------------------------------ Product page: options, swatches, photo, grid
    await page.goto(`${APP}/en/dashboard/products/new`);
    await main.getByLabel("Name").fill("Polo Waza");
    await main.getByLabel("Selling price (FCFA)").fill("8000");
    await main.getByLabel("Category").fill("Polos");
    await main.getByRole("button", { name: "Add colours" }).click();
    const colourValue = main.getByLabel("Colour: New value");
    for (const c of ["Red", "Black", "Blue"]) {
      await colourValue.fill(c);
      await colourValue.press("Enter");
    }
    await main.getByLabel("Swatch for Red").fill("#d62828");
    await main.getByLabel("Swatch for Black").fill("#111111");
    await main.getByLabel("Photo of Red").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: PNG });
    await main.getByRole("button", { name: "Add sizes" }).click();
    await main.getByRole("button", { name: "Add S, M, L, XL" }).click();
    ok("the grid makes every combination (3 colours × 4 sizes)", (await main.getByText("12 combinations.", { exact: false }).count()) === 1);
    await main.getByLabel("Stock for all").fill("3");
    await main.getByRole("button", { name: "Apply to all" }).click();
    await main.getByLabel("Blue / M: Stock").fill("0");
    await main.getByLabel("Black / XL: Price +/−").fill("1000");
    await page.screenshot({ path: "test-results/options-product-form.png", fullPage: true });
    await main.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/dashboard\/products\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    const productId = page.url().split("/").pop().split("?")[0];

    const options = JSON.parse(sql(`select options from products where id = '${productId}'`));
    ok(
      "options saved in order, with swatches and the Red photo in the business's storage folder",
      options.map((o) => o.name).join(",") === "Colour,Size" && options[0].colour === true && options[0].values[0].hex === "#d62828" &&
        options[0].values[0].image_url?.startsWith(`${SUPABASE}/storage/v1/object/public/product-images/${biz}/${productId}/`) && options[0].values[2].image_url === null &&
        options[1].values.map((v) => v.value).join(",") === "S,M,L,XL",
      JSON.stringify(options),
    );
    ok(
      "12 combinations saved with their own stock and price difference",
      sql(`select count(*) from product_variants where product_id = '${productId}' and options is not null`) === "12" && stock("Blue", "M") === "0" && stock("Red", "S") === "3" &&
        sql(`select price_modifier::int || ' ' || name || ' ' || value from product_variants where product_id = '${productId}' and options = '{"Colour":"Black","Size":"XL"}'`) === "1000 Colour / Size Black / XL",
    );

    // Edit: the grid and the photo are back; removing a size removes its combinations, the others keep their id.
    const redS = sql(`select id from product_variants where product_id = '${productId}' and options = '{"Colour":"Red","Size":"S"}'`);
    await main.getByTestId("combination-grid").waitFor({ timeout: 10000 });
    ok("edit: the photo of Red is shown", (await main.getByRole("img", { name: "Photo of Red" }).count()) === 1);
    await main.getByRole("button", { name: "Remove L", exact: true }).click();
    await main.getByRole("button", { name: "Save" }).click();
    await main.getByText("Product saved.").first().waitFor({ timeout: 10000 });
    await sleep(500);
    ok(
      "edit: removing size L leaves 9 combinations; existing ones keep their stock and id; the photo stays",
      sql(`select count(*) from product_variants where product_id = '${productId}'`) === "9" && stock("Red", "S") === "3" &&
        sql(`select id from product_variants where product_id = '${productId}' and options = '{"Colour":"Red","Size":"S"}'`) === redS &&
        JSON.parse(sql(`select options from products where id = '${productId}'`))[0].values[0].image_url === options[0].values[0].image_url,
    );

    // An older product with one-option variants still works the old way.
    await page.goto(`${APP}/en/dashboard/products/new`);
    await main.getByLabel("Name").fill("Casquette");
    await main.getByLabel("Selling price (FCFA)").fill("3000");
    await main.getByRole("button", { name: "Add variant" }).click();
    await main.getByLabel("Option", { exact: true }).fill("Size");
    await main.getByLabel("Value", { exact: true }).fill("Adult");
    await main.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\?saved=1/, { timeout: 15000 });
    ok("one-option variants (no colour × size) still save as before", sql(`select v.name || ':' || v.value || ':' || coalesce(v.options::text, 'null') from product_variants v join products p on p.id = v.product_id where p.business_id = '${biz}' and p.name = 'Casquette'`) === "Size:Adult:null");

    // ------------------------------------------------------------ Till: colour, then size; sold out greyed out
    await page.goto(`${APP}/en/dashboard/sales/new`);
    const card = main.getByTestId("pos-product").filter({ hasText: "Polo Waza" });
    await card.waitFor({ timeout: 15000 });
    const addBtn = card.getByRole("button", { name: "Add", exact: true });
    ok("till: Add waits until colour and size are chosen", await addBtn.isDisabled());
    await card.getByRole("radio", { name: "Blue" }).click();
    ok("till: Blue in M is sold out → greyed out", await card.getByRole("radio", { name: /^M/ }).isDisabled());
    await card.getByRole("radio", { name: "Black" }).click();
    await card.getByRole("radio", { name: "XL" }).click();
    ok("till: the price follows the combination (8,000 + 1,000)", (await card.innerText()).includes("9,000 FCFA"));
    await page.screenshot({ path: "test-results/options-till.png", fullPage: true });
    await addBtn.click();
    ok("till: the cart line names the combination", (await main.getByTestId("pos-cart").innerText()).includes("Colour: Black · Size: XL · 9,000 FCFA"), await main.getByTestId("pos-cart").innerText());
    await main.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-f-]{36}\?new=1/, { timeout: 15000 });
    const receipt = await main.getByTestId("receipt").innerText();
    ok("receipt shows the combination; its stock went down (3 → 2)", receipt.includes("Colour: Black · Size: XL") && stock("Black", "XL") === "2", receipt.replace(/\n/g, " | "));

    // ------------------------------------------------------------ Order form
    sql(`insert into customers (business_id, whatsapp_phone, name) values ('${biz}', '237670300001', 'Clarisse')`);
    await page.goto(`${APP}/en/dashboard/orders/new`);
    await main.getByLabel("Customer").selectOption({ label: "Clarisse · CUS-000001 · +237670300001" });
    await main.getByRole("button", { name: "Add product" }).click();
    await main.getByLabel("Product", { exact: true }).selectOption({ label: "Polo Waza — 8,000 FCFA" });
    await main.getByRole("button", { name: "New order" }).click();
    await main.getByText("Choose the colour, size… for each item that has options.").waitFor({ timeout: 10000 });
    ok("order form: a polo without its colour and size is refused", sql(`select count(*) from orders where business_id = '${biz}' and channel <> 'pos'`) === "0");
    await main.getByRole("radio", { name: "Red" }).click();
    await main.getByRole("radio", { name: "M", exact: true }).click();
    ok("order form: the chosen combination is shown", (await main.getByTestId("order-item-choice").innerText()) === "Colour: Red · Size: M");
    await main.getByRole("button", { name: "New order" }).click();
    await page.waitForURL(/\/dashboard\/orders\/[0-9a-f-]{36}\?saved=1/, { timeout: 15000 });
    ok(
      "order form: order line records the combination and takes its stock (3 → 2)",
      sql(`select i.variant from order_items i join orders o on o.id = i.order_id where o.business_id = '${biz}' and o.channel <> 'pos'`) === "Colour: Red · Size: M" && stock("Red", "M") === "2",
    );
    ok("order page shows the combination", (await main.innerText()).includes("Colour: Red · Size: M"));

    // ------------------------------------------------------------ Assistant (test chat: real lookups, nothing saved)
    await page.goto(`${APP}/en/dashboard/ai/test`);
    const chat = main.getByLabel("Write as a customer would…");
    await chat.fill("Quelles couleurs avez-vous en M pour le polo ?");
    await chat.press("Enter");
    await main.getByText(/^En M, nous avons/).waitFor({ timeout: 20000 });
    ok("assistant: colours in size M come from real stock (Blue M is sold out)", (await main.getByText("En M, nous avons : Red, Black.").count()) === 1);
    await chat.fill("Montrez-moi la red, le polo");
    await chat.press("Enter");
    await main.getByTestId("test-chat-photo").waitFor({ timeout: 20000 });
    ok("assistant: shows the Red photo", (await main.getByTestId("test-chat-photo").innerText()).includes("Polo Waza — Red") && (await main.getByTestId("test-chat-photo").locator("img").getAttribute("src")) === options[0].values[0].image_url);
    await chat.fill("Je prends 2 polo");
    await chat.press("Enter");
    await main.getByText("Impossible : choose_options.").waitFor({ timeout: 20000 });
    ok("assistant: an order without colour and size is refused (choose_options)", true);
    await page.screenshot({ path: "test-results/options-test-chat.png", fullPage: true });

    // ------------------------------------------------------------ WhatsApp: the colour photo and the exact combination
    await page.goto(`${APP}/en/dashboard/whatsapp`);
    await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
    await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
    await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
    await main.getByRole("button", { name: "Connect WhatsApp" }).click();
    await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });

    const sentBefore = graph.sent().sent.length;
    await deliver("Montrez-moi la red, le polo");
    const image = await waitFor(() => graph.sent().sent.slice(sentBefore).find((m) => m.type === "image"), 30000);
    const texts = graph.sent().sent.slice(sentBefore).filter((m) => m.type === "text").map((m) => m.text.body);
    ok("WhatsApp: the reply, then the Red photo with its caption", texts[0] === "Voici le Polo Waza en Red." && image?.image.link === options[0].values[0].image_url && image.image.caption === "Polo Waza — Red", JSON.stringify(graph.sent().sent.slice(sentBefore)));
    const photoRow = await waitFor(() => sql(`select message_type || '|' || caption || '|' || (payload ->> 'catalog_image_url') from messages where business_id = '${biz}' and sender_type = 'ai' and message_type = 'image'`));
    ok("WhatsApp: the photo is recorded in the conversation", photoRow === `image|Polo Waza — Red|${options[0].values[0].image_url}`, photoRow ?? "");

    await deliver("Je prends 1 black en m pour le polo");
    const orderText = await waitFor(() => graph.sent().sent.map((m) => m.text?.body ?? "").find((t) => t.startsWith("Commande ORD-")), 30000);
    ok("WhatsApp: the assistant orders the exact combination", orderText === "Commande ORD-00003 : Colour: Black · Size: M, 8000 XAF.", orderText ?? "");
    ok(
      "WhatsApp: the order line records it and its stock went down (3 → 2)",
      sql(`select i.variant from order_items i join orders o on o.id = i.order_id where o.business_id = '${biz}' and o.order_number = 'ORD-00003'`) === "Colour: Black · Size: M" && stock("Black", "M") === "2",
    );

    await page.goto(`${APP}/en/dashboard/conversations`);
    await main.getByRole("link", { name: /Brenda/ }).click();
    await main.getByRole("img", { name: "Polo Waza — Red" }).waitFor({ timeout: 15000 });
    ok("inbox: the photo the assistant sent is shown", (await main.getByRole("img", { name: "Polo Waza — Red" }).count()) === 1);
    await page.screenshot({ path: "test-results/options-inbox.png", fullPage: true });

    // ------------------------------------------------------------ Mobile: product form and till fit a phone
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const m = await phone.newPage();
    for (const path of [`/dashboard/products/${productId}`, "/dashboard/sales/new", "/dashboard/orders/new"]) {
      await m.goto(`${APP}/en${path}`);
      await m.locator("main").waitFor();
      await sleep(800);
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`mobile: ${path} fits a 390 px screen`, overflow <= 0, `overflow ${overflow}px`);
    }
    await m.goto(`${APP}/en/dashboard/products/${productId}`);
    await m.screenshot({ path: "test-results/options-product-mobile.png", fullPage: true });
    await phone.close();

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
    await page.screenshot({ path: "test-results/options-failure.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    graph.close();
    claude.close();
    console.log(results.join("\n"));
  }
})();
