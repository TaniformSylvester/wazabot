/*
 * Phones: every public page, the main dashboard pages and the WazaBolt admin
 * pages at 360px (a common Android width in Cameroon) — no sideways
 * scrolling, tables shown as cards, and the main buttons big enough to tap.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:mobile
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

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

/** How far the page is wider than the phone, and what sticks out. */
const measure = () => {
  const vw = document.documentElement.clientWidth;
  const wide = [];
  for (const el of document.querySelectorAll("main *")) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1) {
      let clipped = false;
      for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX) && p.getBoundingClientRect().right <= vw + 1) clipped = true;
      if (!clipped) wide.push(`${el.tagName.toLowerCase()} "${(el.innerText || "").trim().slice(0, 30)}"`);
    }
  }
  return { over: Math.max(document.documentElement.scrollWidth, window.innerWidth) - vw, wide: wide.slice(0, 3) };
};

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const U = { name: "Mobile Owner", business: "Boutique Mobile", email: `mobile+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const phone = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: "en-US" };

  try {
    // ---------------------------------------------------------------- public pages
    const anon = await browser.newContext(phone);
    const pub = await anon.newPage();
    for (const p of ["", "/features", "/how-it-works", "/solutions", "/pricing", "/about", "/faq", "/contact", "/resources", "/privacy", "/terms", "/login", "/register"]) {
      await pub.goto(`${APP}/en${p}`, { waitUntil: "networkidle" });
      const m = await pub.evaluate(measure);
      ok(`public ${p || "/"}: fits a 360px phone`, m.over <= 0, `+${m.over}px ${m.wide.join(", ")}`);
    }
    await pub.goto(`${APP}/en`);
    await pub.locator("header button[aria-expanded]").first().click();
    await pub.getByRole("dialog").getByRole("link", { name: "Pricing" }).waitFor({ timeout: 5000 });
    ok("public menu opens on a phone", true);
    await anon.close();

    // ---------------------------------------------------------------- a shop with data, owner is also WazaBolt admin
    const ctx = await browser.newContext(phone);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${APP}/en/register`);
    await page.getByLabel("Your name").fill(U.name);
    await page.getByLabel("Business name").fill(U.business);
    await page.getByLabel("Email", { exact: true }).fill(U.email);
    await page.getByLabel("Password", { exact: true }).fill(U.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    await page.goto(linkFrom(await latestMail(U.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/onboarding/);
    const userId = sql(`select id from auth.users where email = '${U.email}'`);
    const biz = sql(`select business_id from business_members where user_id = '${userId}'`);
    sql(`update businesses set onboarding_step = 6, onboarding_completed_at = now(), free_limits_from = '2099-12-31' where id = '${biz}'`);
    sql(`insert into platform_admins (user_id) values ('${userId}')`);
    const product = sql(`insert into products (business_id, name, sku, price, stock_quantity) values ('${biz}', 'Robe wax longue en coton imprimé', 'RW-LONG-01', 1250000, 40) returning id`);
    const customer = sql(`insert into customers (business_id, whatsapp_phone, name, city, tags) values ('${biz}', '237670555001', 'Marie-Claire Ngo Bassong Epse Mbarga', 'Yaoundé', '{vip,wholesale}') returning id`);
    const order = sql(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
      select public.create_order('${biz}', '${customer}', '[{"product_id":"${product}","quantity":3}]'::jsonb, null, 2500, 0, 'Bastos, Yaoundé'); commit;`).split("\n").filter(Boolean).pop();

    const pages = [
      "", "/customers", `/customers/${customer}`, "/customers/new", "/orders", `/orders/${order}`, "/orders/new", `/orders/${order}/document?type=invoice`,
      "/products", `/products/${product}`, "/sales", "/sales/new", "/expenses", "/reports", "/conversations", "/knowledge", "/ai", "/team", "/billing", "/settings", "/whatsapp",
    ].map((p) => `/en/dashboard${p}`).concat(["/en/admin/businesses", "/en/admin/plan-requests", "/en/admin/margins", "/en/admin/pricing"]);
    for (const p of pages) {
      await page.goto(`${APP}${p}`, { waitUntil: "networkidle" });
      const m = await page.evaluate(measure);
      ok(`${p.replace(/[0-9a-f-]{36}/, ":id")}: fits a 360px phone`, m.over <= 0 && m.wide.length === 0, `+${m.over}px ${m.wide.join(", ")}`);
    }

    // Lists are cards on a phone: no table to scroll sideways, labels shown.
    for (const p of ["/en/dashboard/orders", "/en/dashboard/customers", "/en/admin/businesses"]) {
      await page.goto(`${APP}${p}`, { waitUntil: "networkidle" });
      const t = await page.evaluate(() => {
        const table = document.querySelector("main table.stack-table");
        const cell = table?.querySelector("tbody td:nth-child(2)");
        return { scroll: table ? table.parentElement.scrollWidth - table.parentElement.clientWidth : -1, label: cell ? getComputedStyle(cell, "::before").content : "" };
      });
      ok(`${p}: rows shown as cards with column labels (no sideways scrolling)`, t.scroll === 0 && t.label.length > 2, JSON.stringify(t));
    }
    await page.goto(`${APP}/en/admin/businesses`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "test-results/mobile-admin-businesses.png" });
    const navRight = await page.evaluate(() => Math.max(...[...document.querySelectorAll('nav[aria-label="WazaBolt admin"] a')].map((a) => a.getBoundingClientRect().right)));
    ok("admin tabs all visible on a phone", navRight <= 360, String(navRight));

    // Tap targets in the top bar.
    await page.goto(`${APP}/en/dashboard`, { waitUntil: "networkidle" });
    const sizes = await page.evaluate(() => [...document.querySelectorAll('header [role="group"] button, header button[aria-label], header a[aria-label]')].map((b) => Math.round(b.getBoundingClientRect().height)));
    ok("top bar buttons are at least 32px tall", sizes.length >= 3 && sizes.every((h) => h >= 32), sizes.join(","));
    await page.screenshot({ path: "test-results/mobile-orders.png" });
    ok("no browser errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    results.push(`CRASH ${e.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
    console.log(results.join("\n"));
  }
})();
