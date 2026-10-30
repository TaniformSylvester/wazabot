/*
 * End-to-end test of the public shop page: off until the owner turns it on in
 * Settings; then anyone (no account) sees the business and its active
 * products with prices and small photos, orders on WhatsApp, searches; out of
 * stock is shown, hidden products and other businesses' photos aren't; the
 * page and photos are cacheable; turning it off takes it down.
 * Against the local stack.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npm run test:e2e:shop
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.DATABASE_URL;
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !DB || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL");

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

/** A big phone photo (1600 × 1600 JPEG) uploaded to the business's folder in product-images. */
async function uploadPhoto(path, colour) {
  // Random detail compresses badly, like a real photo (a plain colour would be a few KB).
  const noise = Buffer.alloc(1600 * 1600 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 255) | 0;
  const jpg = await sharp(noise, { raw: { width: 1600, height: 1600, channels: 3 } }).tint(colour).jpeg({ quality: 92 }).toBuffer();
  const res = await fetch(`${SUPABASE}/storage/v1/object/product-images/${path}`, { method: "POST", headers: { authorization: `Bearer ${SERVICE}`, apikey: SERVICE, "content-type": "image/jpeg", "x-upsert": "true" }, body: jpg });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return { url: `${SUPABASE}/storage/v1/object/public/product-images/${path}`, bytes: jpg.length };
}

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const browser = await chromium.launch();
  const errors = [];
  try {
    // ---------------------------------------------------------------- An owner with a few products
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept());
    const main = page.locator("main");
    const OWNER = { email: `shop-owner+${stamp}@example.com`, password: "Wazabolt2026" };
    await page.goto(`${APP}/en/register`);
    await page.getByLabel("Your name").fill("Awa Fon");
    await page.getByLabel("Business name").fill(`Awa Styles ${stamp}`);
    await page.getByTestId("business-type").getByText("Shop", { exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(OWNER.email);
    await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    await page.goto(linkFrom(await latestMail(OWNER.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/onboarding/, { timeout: 15000 });
    const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    const slug = sql(`select slug from businesses where id = '${biz}'`);
    sql(`update businesses set phone = '+237 670 00 00 01', city = 'Douala', description = 'La mode wax de Douala', default_language = 'fr' where id = '${biz}'`);
    sql(`insert into products (business_id, name, price, category, stock_quantity, active) values
         ('${biz}', 'Robe Ankara', 15000, 'Robes', 5, true),
         ('${biz}', 'Sac en raphia', 8000, 'Sacs', 0, true),
         ('${biz}', 'Old stock', 1000, 'Sacs', 3, false)`);
    const robe = sql(`select id from products where business_id = '${biz}' and name = 'Robe Ankara'`);
    const photo = await uploadPhoto(`${biz}/${robe}/photo.jpg`, "#c0392b");
    sql(`update products set image_url = '${photo.url}' where id = '${robe}'`);

    // ---------------------------------------------------------------- Off until the owner turns it on
    const visitor = await (await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, locale: "fr-FR" })).newPage();
    visitor.on("pageerror", (e) => errors.push(`visitor: ${e}`));
    let res = await visitor.goto(`${APP}/s/${slug}`);
    ok("before it's turned on, the shop link shows 'Shop not found' (404), not kept by the browser", res.status() === 404 && (await visitor.getByText("Shop not found").count()) === 1 && /max-age=0/.test(res.headers()["cache-control"] ?? ""));

    await page.goto(`${APP}/en/dashboard/settings`);
    const panel = main.getByTestId("shop-settings");
    await panel.waitFor({ timeout: 15000 });
    ok("Settings → Shop page says it's off and what it would show", /Your shop page is off/.test(await panel.innerText()) && /Never your stock quantities, costs or customers/.test(await panel.innerText()));
    await panel.getByRole("button", { name: "Turn on my shop page" }).click();
    await panel.getByText("Your shop page is on").waitFor({ timeout: 15000 });
    ok("the owner turns it on: the link, Open and Share on WhatsApp appear", (await panel.innerText()).includes(`/s/${slug}`) && (await panel.getByRole("link", { name: "Share on WhatsApp" }).count()) === 1);
    ok("…recorded in the audit log", sql(`select count(*) from audit_logs where business_id = '${biz}' and action = 'shop.enabled'`) === "1");

    // ---------------------------------------------------------------- A visitor (no account)
    res = await visitor.goto(`${APP}/s/${slug}`);
    const html = await res.text();
    const body = await visitor.locator("body").innerText();
    ok("anyone opens the shop: name, city, description, in the business's language (French)", res.status() === 200 && body.includes(`Awa Styles ${stamp}`) && body.includes("Douala") && body.includes("La mode wax de Douala") && (await visitor.locator("html").getAttribute("lang")) === "fr");
    ok("active products with their price; the hidden one isn't there", body.includes("Robe Ankara") && /15\s000 FCFA/.test(body) && body.includes("Sac en raphia") && !body.includes("Old stock"));
    ok("out of stock is said, with no order button for it", /Sac en raphia\s*8\s000 FCFA\s*Rupture de stock/.test(body) && (await visitor.getByRole("link", { name: "Commander sur WhatsApp" }).count()) === 1);
    const order = await visitor.getByRole("link", { name: "Commander sur WhatsApp" }).getAttribute("href");
    ok("Order on WhatsApp opens the business's number with the product and price", order.startsWith("https://wa.me/237670000001?text=") && /Robe Ankara \(15\s000 FCFA\)/.test(decodeURIComponent(order.split("text=")[1])), decodeURIComponent(order));
    ok("…and a Chat on WhatsApp bar stays at the bottom", (await visitor.getByRole("link", { name: "Écrire sur WhatsApp" }).count()) === 1);
    ok("the page is plain HTML: no framework scripts, no web fonts", !/_next\/static|<script src|fonts\.g/.test(html));
    ok("the page is cacheable at the CDN (a few minutes)", /s-maxage=300/.test(res.headers()["cache-control"] ?? ""), res.headers()["cache-control"]);
    ok("stock quantities are never in the page", !/\b5 en stock|quantity|stock_quantity/i.test(html));
    await visitor.screenshot({ path: "test-results/shop-page.png", fullPage: true });

    // Photos: shrunk once, cached for a year.
    const imgSrc = await visitor.locator("img.ph").first().getAttribute("src");
    const img = await visitor.request.get(`${APP}${imgSrc}`);
    const imgBody = await img.body();
    ok(
      `the product photo is a small WebP (${Math.round(imgBody.length / 1024)} KB instead of ${Math.round(photo.bytes / 1024)} KB), cached for a year`,
      img.status() === 200 && img.headers()["content-type"] === "image/webp" && imgBody.length < 30 * 1024 && /immutable/.test(img.headers()["cache-control"] ?? ""),
    );
    const meta = await sharp(imgBody).metadata();
    ok("…300 × 300 pixels", meta.width === 300 && meta.height === 300, `${meta.width}×${meta.height}`);

    // Another business's photo, or a hidden product's, isn't served through this shop.
    const other = sql(`select id from products where business_id <> '${biz}' and image_url is not null limit 1`) || "00000000-0000-4000-8000-000000000000";
    const oldId = sql(`select id from products where business_id = '${biz}' and name = 'Old stock'`);
    ok("photos of other businesses or hidden products aren't served", (await visitor.request.get(`${APP}/s/${slug}/img/${other}`)).status() === 404 && (await visitor.request.get(`${APP}/s/${slug}/img/${oldId}`)).status() === 404);

    // Search works without JavaScript; English on request.
    const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
    await noJs.goto(`${APP}/s/${slug}?q=raphia&lang=en`);
    const searched = await noJs.locator("main").innerText();
    ok("search works even without JavaScript, and ?lang=en gives English", searched.includes("Sac en raphia") && !searched.includes("Robe Ankara") && searched.includes("Out of stock") && searched.includes("1 products"));
    await noJs.goto(`${APP}/s/${slug}?cat=Robes`);
    const cat = await noJs.locator("main").innerText();
    ok("category links filter the products", cat.includes("Robe Ankara") && !cat.includes("Sac en raphia"));

    // ---------------------------------------------------------------- Turning it off
    await page.goto(`${APP}/en/dashboard/settings`);
    await panel.getByRole("button", { name: "Turn off" }).click();
    await panel.getByText("Your shop page is off").waitFor({ timeout: 15000 });
    res = await visitor.goto(`${APP}/s/${slug}?again=1`);
    ok("turned off: the link shows 'Shop not found' again", res.status() === 404);

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
