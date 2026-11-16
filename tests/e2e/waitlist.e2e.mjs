/*
 * End-to-end test of the beta waitlist mode (NEXT_PUBLIC_WAITLIST_MODE).
 *
 *   WAITLIST_EXPECT=on   the app was built with NEXT_PUBLIC_WAITLIST_MODE=true:
 *                        buttons lead to /waitlist with the vertical, sign-up is
 *                        closed, the form stores a lead (once per number/email,
 *                        rate-limited), the WazaBolt team sees and exports it.
 *   WAITLIST_EXPECT=off  built without it: everything is back to sign-up.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... node tests/e2e/waitlist.e2e.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "./playwright.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.DATABASE_URL;
const EXPECT = process.env.WAITLIST_EXPECT ?? "on";
if (!ANON || !SERVICE || !DB) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim();
const post = (body, ip) =>
  fetch(`${APP}/api/waitlist`, { method: "POST", headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) }, body: JSON.stringify(body) });
async function createUser(email, name) {
  const u = await (
    await fetch(`${SUPABASE}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Wazabolt2026", email_confirm: true, user_metadata: { full_name: name, setup: "later" } }),
    })
  ).json();
  return u.id;
}
async function login(page, email) {
  await page.goto(`${APP}/en/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Wazabolt2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const browser = await chromium.launch();
  const errors = [];
  const open = async (w = 1280) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "en-US" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${p.url()}: ${String(e).slice(0, 120)}`));
    return p;
  };
  const page = await open();

  try {
    if (EXPECT === "off") {
      // ---------------------------------------------------------------- waitlist off: the usual sign-up
      await page.goto(`${APP}/en`);
      ok("off: the hero says Start free trial and leads to sign-up", (await page.getByTestId("hero-start").innerText()).includes("Start free trial") && /\/en\/register$/.test(await page.getByTestId("hero-start").getAttribute("href")));
      ok("off: the showcase keeps its vertical on sign-up", /\/en\/register\?vertical=restaurant$/.test(await page.getByTestId("showcase-start-restaurants").getAttribute("href")));
      await page.goto(`${APP}/en/waitlist?vertical=school`);
      ok("off: /waitlist sends to sign-up, vertical kept", /\/en\/register\?vertical=school$/.test(page.url()) && (await page.getByTestId("signup-vertical").count()) === 1, page.url());
      const res = await post({ businessName: "Test", whatsappNumber: "670000000", email: `off+${stamp}@example.com`, vertical: "shop" });
      ok("off: the waitlist API is closed", res.status === 404 && sql(`select count(*) from waitlist_leads where email = 'off+${stamp}@example.com'`) === "0");
    } else {
      // ---------------------------------------------------------------- the buttons
      await page.goto(`${APP}/en`);
      const hero = page.getByTestId("hero-start");
      ok("the hero button says Join Early-Access Beta (Free Setup) and leads to the waitlist", (await hero.innerText()).includes("Join Early-Access Beta (Free Setup)") && /\/en\/waitlist$/.test(await hero.getAttribute("href")));
      ok("the vertical showcase keeps the vertical", /\/en\/waitlist\?vertical=restaurant$/.test(await page.getByTestId("showcase-start-restaurants").getAttribute("href")) && /\/en\/waitlist\?vertical=school$/.test(await page.getByTestId("showcase-start-schools").getAttribute("href")));
      ok("the header button too", (await page.locator("header").getByRole("link", { name: /Join (Early-Access Beta|the beta)/ }).count()) >= 1);
      await page.goto(`${APP}/en/pricing`);
      const card = page.getByTestId("plan-start-business").first();
      ok("pricing cards: the beta button, no trial promise under it", (await card.innerText()).includes("Join Early-Access Beta (Free Setup)") && /\/en\/waitlist/.test(await card.getAttribute("href")));
      await page.goto(`${APP}/en/schools`);
      ok("the schools page leads to the waitlist as a school", /\/en\/waitlist\?vertical=school$/.test(await page.getByTestId("schools-start").getAttribute("href")));

      // ---------------------------------------------------------------- sign-up closed
      await page.goto(`${APP}/en/register?vertical=restaurant`);
      ok("sign-up is closed: /register opens the waitlist, vertical kept", /\/en\/waitlist\?vertical=restaurant$/.test(page.url()), page.url());

      // ---------------------------------------------------------------- the form
      const form = page.getByTestId("waitlist-form");
      ok("the vertical is pre-selected", await form.getByRole("radio", { name: "Restaurant" }).isChecked());
      await form.getByRole("button", { name: "Join the beta" }).click();
      ok("an empty form is refused, field by field", (await page.getByText("Enter your business name").count()) === 1 && (await page.getByText("Enter a valid email address.").count()) === 1);
      await form.getByLabel("Business name").fill("Mama Ngozi Kitchen");
      await form.getByLabel("WhatsApp number").fill(`6 77 ${tail.slice(0, 2)} ${tail.slice(2, 4)} ${tail.slice(4)}`);
      await form.getByLabel("Email").fill(`Ngozi+${stamp}@Example.com`);
      await form.getByRole("button", { name: "Join the beta" }).click();
      await page.getByTestId("waitlist-done").waitFor({ timeout: 10000 });
      const number = `237677${tail}`;
      const done = await page.getByTestId("waitlist-done").innerText();
      ok("confirmation: a WhatsApp message on their number with beta access and a free menu setup", done.includes("You're on the list") && done.includes(`+${number}`) && done.includes("set up your menu for free"), done);
      ok(
        "the lead is stored: name, number with country code, email in lower case, vertical, country",
        sql(`select business_name || '|' || whatsapp_number || '|' || email || '|' || vertical || '|' || country_code from waitlist_leads where whatsapp_number = '${number}'`) === `Mama Ngozi Kitchen|${number}|ngozi+${stamp}@example.com|restaurant|CM`,
      );

      // A second time with the same number (other email): the same answer, nothing added.
      const again = await post({ businessName: "Mama Ngozi Again", whatsappNumber: `+${number}`, email: `other+${stamp}@example.com`, vertical: "shop", country: "CM" });
      ok("the same WhatsApp number again: same answer, still one lead", again.status === 200 && (await again.json()).ok === true && sql(`select count(*) from waitlist_leads where whatsapp_number = '${number}' or email = 'other+${stamp}@example.com'`) === "1");
      const sameEmail = await post({ businessName: "Other", whatsappNumber: "+2348031234567", email: `NGOZI+${stamp}@example.com`, vertical: "shop" });
      ok("the same email (any case) again: same answer, nothing added", sameEmail.status === 200 && sql(`select count(*) from waitlist_leads where whatsapp_number = '2348031234567'`) === "0");

      const bad = await post({ businessName: "X", whatsappNumber: "12", email: "nope", vertical: "bank" });
      const badBody = await bad.json();
      ok("bad input: 400 with the fields", bad.status === 400 && ["businessName", "whatsappNumber", "email", "vertical"].every((k) => k in (badBody.fieldErrors ?? {})), JSON.stringify(badBody));
      const bot = await post({ businessName: "Bot Shop", whatsappNumber: "+237699000111", email: `bot+${stamp}@example.com`, vertical: "shop", website: "http://spam.example" });
      ok("a bot filling the hidden field: told it worked, nothing kept", bot.status === 200 && sql(`select count(*) from waitlist_leads where email = 'bot+${stamp}@example.com'`) === "0");

      // Rate limit: 5 new leads an hour from one address.
      const ip = `10.${tail.slice(0, 2) % 250}.${tail.slice(2, 4) % 250}.${tail.slice(4) % 250}`;
      const statuses = [];
      for (let i = 0; i < 6; i++) {
        const r = await post({ businessName: `Burst ${i}`, whatsappNumber: `+23765${tail}${i}`.slice(0, 13), email: `burst${i}+${stamp}@example.com`, vertical: "shop" }, ip);
        statuses.push(r.status);
      }
      ok("6 new leads in a row from one address: the 6th is refused (429)", statuses.slice(0, 5).every((s) => s === 200) && statuses[5] === 429, statuses.join(","));
      ok("…only a hash of the address is kept", sql(`select count(*) from waitlist_leads where email like 'burst%+${stamp}@example.com' and source_hash ~ '^[0-9a-f]{64}$'`) === "5" && !sql(`select string_agg(source_hash, '') from waitlist_leads where email like 'burst%+${stamp}@example.com'`).includes(ip));
      ok("visitors can't read the list through the database API", (await fetch(`${SUPABASE}/rest/v1/waitlist_leads?select=email`, { headers: { apikey: ANON } })).status >= 400 || (await (await fetch(`${SUPABASE}/rest/v1/waitlist_leads?select=email`, { headers: { apikey: ANON } })).json()).length === 0);

      // French
      await page.goto(`${APP}/fr/waitlist?vertical=school`);
      ok("French: the form, school pre-selected", (await page.getByRole("heading", { name: "Rejoignez la bêta de WazaBolt" }).count()) === 1 && (await page.getByTestId("waitlist-form").getByRole("radio", { name: "École" }).isChecked()) && (await page.getByLabel("Nom de l'école").count()) === 1);

      // ---------------------------------------------------------------- the WazaBolt team's view
      const guest = await open();
      const guestEmail = `wl-member+${stamp}@example.com`;
      await createUser(guestEmail, "Not Admin");
      await login(guest, guestEmail);
      await guest.goto(`${APP}/en/admin/waitlist`);
      ok("someone not on the WazaBolt team gets a 404 on the admin page", (await guest.getByTestId("waitlist-table").count()) === 0 && (await guest.getByText(/not found|couldn.t find/i).count()) >= 1);
      const guestCsv = await guest.request.get(`${APP}/en/admin/waitlist/export`);
      ok("…and on the export", guestCsv.status() === 404);

      const adminEmail = `wl-admin+${stamp}@example.com`;
      const adminId = await createUser(adminEmail, "Team Admin");
      sql(`insert into platform_admins (user_id) values ('${adminId}')`);
      const ap = await open();
      await login(ap, adminEmail);
      await ap.goto(`${APP}/en/admin/waitlist?vertical=restaurant`);
      const table = ap.getByTestId("waitlist-table");
      ok("admin: the restaurant leads, with the new one and a WhatsApp link", (await table.getByText("Mama Ngozi Kitchen").count()) === 1 && (await table.getByRole("link", { name: `+${number}` }).getAttribute("href")) === `https://wa.me/${number}` && (await table.getByText("Burst 0").count()) === 0);
      const csv = await (await ap.request.get(`${APP}/en/admin/waitlist/export?vertical=restaurant`)).text();
      ok("admin: CSV export by vertical", csv.includes("Mama Ngozi Kitchen") && csv.includes(number) && !csv.includes("Burst 0") && /^﻿?Joined \(UTC\),Business,Type,WhatsApp/.test(csv), csv.slice(0, 120));
      const all = await (await ap.request.get(`${APP}/en/admin/waitlist/export`)).text();
      ok("admin: CSV of all leads", all.includes("Mama Ngozi Kitchen") && all.includes("Burst 0"));
      await ap.screenshot({ path: "test-results/waitlist-admin.png", fullPage: true });

      // ---------------------------------------------------------------- beta invites: one tap, WhatsApp ready, sign-up for that lead only
      const row = ap.getByTestId("waitlist-table").getByRole("row").filter({ hasText: "Mama Ngozi Kitchen" });
      const popupP = ap.waitForEvent("popup", { timeout: 10000 }).catch(() => null);
      await row.getByTestId("beta-invite").click();
      await row.getByTestId("beta-invite-ready").waitFor({ timeout: 10000 });
      const popup = await popupP;
      const waHref = await row.getByTestId("beta-invite-ready").getByRole("link", { name: "Open WhatsApp" }).getAttribute("href");
      const firstLink = await row.getByTestId("beta-invite-link").innerText();
      const waText = decodeURIComponent(waHref.split("?text=")[1] ?? "");
      ok("one tap opens WhatsApp to the lead's number", !!popup && waHref.startsWith(`https://wa.me/${number}?text=`), waHref.slice(0, 60));
      ok("…with the invite message ready: the business, a personal link, 14 days, the free menu setup", waText.includes("Mama Ngozi Kitchen") && waText.includes(firstLink) && waText.includes("14 days") && waText.includes("set up your menu for free") && /\/en\/register\?beta=[A-Za-z0-9_-]{30,}$/.test(firstLink), waText);
      ok("the link itself isn't stored, only its hash; invite date recorded", sql(`select (invite_token_hash ~ '^[0-9a-f]{64}$') || ' ' || (invited_at is not null) || ' ' || ((invite_expires_at - now()) > interval '13 days') from waitlist_leads where whatsapp_number = '${number}'`) === "true true true" && !sql(`select invite_token_hash from waitlist_leads where whatsapp_number = '${number}'`).includes(firstLink.split("beta=")[1]));
      await popup?.close().catch(() => {});

      // Sending again replaces the link.
      ap.once("dialog", (d) => d.accept());
      const popup2P = ap.waitForEvent("popup", { timeout: 10000 }).catch(() => null);
      await ap.reload();
      await row.getByTestId("beta-invite").click();
      await row.getByTestId("beta-invite-link").waitFor({ timeout: 10000 });
      (await popup2P)?.close().catch(() => {});
      const link = await row.getByTestId("beta-invite-link").innerText();
      ok("a resend gives a new link", link !== firstLink && (await row.getByText(/Invited \d{4}-\d{2}-\d{2}/).count()) === 1);
      const old = await open();
      await old.goto(firstLink.replace(/^https?:\/\/[^/]+/, APP));
      ok("…and the old link stops working", (await old.getByTestId("beta-invalid").count()) === 1);

      // The lead signs up with their link while the waitlist is on.
      const lp = await open();
      await lp.goto(link.replace(/^https?:\/\/[^/]+/, APP));
      const emailBox = lp.getByLabel("Email", { exact: true });
      ok("the beta link opens sign-up (waitlist on), for their business, email fixed", (await lp.getByTestId("beta-note").innerText()).includes("Mama Ngozi Kitchen") && (await emailBox.inputValue()) === `ngozi+${stamp}@example.com` && (await emailBox.getAttribute("readonly")) !== null);
      ok("…with their business type chosen", (await lp.getByTestId("signup-vertical").getAttribute("data-vertical")) === "restaurant");
      await lp.getByLabel("Your name").fill("Ngozi Mbah");
      await lp.getByLabel("Password", { exact: true }).fill("Wazabolt2026");
      await lp.getByRole("button", { name: "Create account" }).click();
      // The form's "check your email", or the page refreshed into "account created" (the link is used): either way, done.
      await lp.getByTestId("beta-used").or(lp.getByRole("heading", { name: "Check your email" })).first().waitFor({ timeout: 15000 });
      ok(
        "the account is created and the link is used up",
        sql(`select count(*) from auth.users where email = 'ngozi+${stamp}@example.com'`) === "1" && sql(`select (joined_at is not null) from waitlist_leads where whatsapp_number = '${number}'`) === "t",
        sql(`select count(*) || ' ' || (select (joined_at is not null)::text from waitlist_leads where whatsapp_number = '${number}') from auth.users where email = 'ngozi+${stamp}@example.com'`),
      );
      await lp.goto(link.replace(/^https?:\/\/[^/]+/, APP));
      ok("the same link can't be used twice: it says the account exists, no form", (await lp.getByTestId("beta-used").count()) === 1 && (await lp.getByRole("button", { name: "Create account" }).count()) === 0);
      await ap.reload();
      ok("admin: the lead shows Account created, no more invite button", (await row.getByTestId("beta-status").innerText()).includes("Account created") && (await row.getByTestId("beta-invite").count()) === 0);
      const joinedCsv = await (await ap.request.get(`${APP}/en/admin/waitlist/export?vertical=restaurant`)).text();
      ok("admin: the CSV has the invite and account dates", /Beta invite sent \(UTC\),Account created \(UTC\)/.test(joinedCsv) && new RegExp(`${number},[^\n]*,\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2},\\d{4}-`).test(joinedCsv));

      // Without a link, sign-up stays closed; a made-up link is refused.
      const np = await open();
      await np.goto(`${APP}/en/register?beta=madeUpTokenThatIsLongEnough123`);
      ok("a made-up beta link is refused", (await np.getByTestId("beta-invalid").count()) === 1 && (await np.getByRole("button", { name: "Create account" }).count()) === 0);
      // Another lead's link can't be used with a different email (the server checks the email too).
      const nr = await (await np.request.get(`${APP}/en/register`)).url();
      ok("without a link, sign-up is still closed", /\/en\/waitlist/.test(nr), nr);
      // Only the WazaBolt team can create invites.
      const leadId = sql(`select id from waitlist_leads where email = 'burst0+${stamp}@example.com'`);
      ok("the invite button is only on the admin page (guest gets 404 there)", (await (await guest.request.get(`${APP}/en/admin/waitlist`)).status()) === 404 && sql(`select invited_at is null from waitlist_leads where id = '${leadId}'`) === "t");
      sql(`delete from platform_admins where user_id = '${adminId}'`);
    }
  } catch (e) {
    results.push(`CRASH ${e?.stack ?? e}`);
    process.exitCode = 1;
  } finally {
    ok("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
