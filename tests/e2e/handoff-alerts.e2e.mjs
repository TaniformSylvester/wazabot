/*
 * The live handoff queue: when a WhatsApp thread starts waiting for a person
 * (or a waiting customer writes again) the dashboard updates without a
 * reload, the tab title shows "(n)", the counter alert sound chimes (if
 * switched on — remembered in the browser) and a browser notification shows
 * (if allowed). Several tabs alert once. Resolving the threads clears it.
 *
 * Web Audio and the Notification API are replaced in the page by recorders,
 * so the test counts chimes and notifications.
 *
 *   APP_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... \
 *   node tests/e2e/handoff-alerts.e2e.mjs
 */
import { execFileSync } from "node:child_process";

import { chromium } from "./playwright.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const DB = process.env.DATABASE_URL;
if (!DB) throw new Error("Set DATABASE_URL");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim();
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
/** Waits (up to ~25 s: the watcher polls every 10 s) for a condition in the page. */
async function until(fn, ms = 25000) {
  for (let t = 0; t < ms; t += 250) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
}

/** Records chimes (two oscillators each) and notifications instead of playing / showing them. */
const RECORDERS = () => {
  window.__osc = 0;
  window.__notes = [];
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    state = "running";
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      window.__osc++;
      return { type: "", frequency: { setValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n };
    }
  }
  window.AudioContext = FakeAudioContext;
  class FakeNotification {
    static permission = "granted";
    static requestPermission() {
      return Promise.resolve("granted");
    }
    constructor(title, opts) {
      window.__notes.push({ title, body: opts?.body ?? "", tag: opts?.tag ?? "" });
    }
    close() {}
  }
  window.Notification = FakeNotification;
};

(async () => {
  const stamp = Date.now();
  const O = { name: "Awa Nkeng", business: `Awa Styles ${stamp}`, email: `handoff-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const errors = [];
  try {
    // Sign up (a shop), then the setup screen.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    await ctx.addInitScript(RECORDERS);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${APP}/en/register?vertical=shop`);
    await page.getByLabel("Your name").fill(O.name);
    await page.getByLabel("Email", { exact: true }).fill(O.email);
    await page.getByLabel("Password", { exact: true }).fill(O.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });
    await page.goto(linkFrom(await latestMail(O.email, "Confirm")));
    await page.waitForURL(/\/dashboard\/setup/, { timeout: 15000 });
    await page.getByLabel("Business name").fill(O.business);
    await page.getByRole("button", { name: "Create my workspace" }).click();
    await page.waitForURL(/\/dashboard\?welcome=1/, { timeout: 15000 });
    const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${O.email}'`);

    // ---------------------------------------------------------------- the switch
    await page.goto(`${APP}/en/dashboard/conversations`);
    const sw = page.getByTestId("alert-sound");
    await sw.waitFor({ timeout: 15000 });
    await sleep(1500);
    ok("the header has the Counter alert sound switch, off by default; the sample chat isn't counted on the tab", (await sw.getAttribute("aria-checked")) === "false" && (await sw.getAttribute("role")) === "switch" && !/^\(\d+\)/.test(await page.title()), await page.title());
    await sw.click();
    ok("turning it on plays the chime once (so it's heard, and the browser allows sound)", (await sw.getAttribute("aria-checked")) === "true" && (await page.evaluate(() => window.__osc)) === 2);
    await page.reload();
    await page.getByTestId("alert-sound").waitFor({ timeout: 15000 });
    await until(async () => (await page.getByTestId("alert-sound").getAttribute("aria-checked")) === "true", 5000);
    ok("the switch is remembered in this browser (localStorage)", (await page.getByTestId("alert-sound").getAttribute("aria-checked")) === "true" && (await page.evaluate(() => localStorage.getItem("wb_alert_sound"))) === "on");
    await sleep(2000); // the first poll sets the baseline

    // ---------------------------------------------------------------- a customer asks for a person
    await page.evaluate(() => (window.__stillHere = true));
    const osc0 = await page.evaluate(() => window.__osc);
    const cust = sql(`insert into customers (business_id, whatsapp_phone, name) values ('${biz}', '237670555001', 'Chantal Mbe') returning id`).split("\n")[0];
    const conv = sql(`insert into conversations (business_id, customer_id, status, ai_enabled, human_requested, unread_count, last_message_at, last_customer_message_at) values ('${biz}', '${cust}', 'open', false, true, 1, now(), now()) returning id`).split("\n")[0];
    const titled = await until(async () => /^\(1\) /.test(await page.title()));
    ok("a new handoff: the tab title shows (1) — no reload", titled && (await page.evaluate(() => window.__stillHere === true)), await page.title());
    await until(async () => (await page.locator("main").getByText("Chantal Mbe").count()) > 0, 10000);
    ok("…the queue updates in place (the thread appears in the list)", (await page.locator("main").getByText("Chantal Mbe").count()) > 0 && (await page.evaluate(() => window.__stillHere === true)));
    ok("…the chime plays, and the header counter shows 1", (await page.evaluate(() => window.__osc)) === osc0 + 2 && (await page.getByTestId("handoff-count").innerText()) === "1");
    const notes1 = await page.evaluate(() => window.__notes);
    ok("…and a browser notification: who is waiting, never the message text", notes1.length === 1 && notes1[0].title === "WazaBolt — a customer is waiting" && notes1[0].body === "Chantal Mbe asked for a person." && notes1[0].tag === `handoff-${conv}`, JSON.stringify(notes1));

    // ---------------------------------------------------------------- the waiting customer writes again
    sql(`update conversations set last_customer_message_at = now() + interval '1 second', last_message_at = now() + interval '1 second', unread_count = 2 where id = '${conv}'`);
    await until(async () => (await page.evaluate(() => window.__notes.length)) >= 2);
    const notes2 = await page.evaluate(() => window.__notes);
    ok("a new message on a waiting thread alerts again (chime and notification)", notes2[1]?.body === "New message from Chantal Mbe." && (await page.evaluate(() => window.__osc)) === osc0 + 4, JSON.stringify(notes2));

    // ---------------------------------------------------------------- sound off; a second tab
    await page.getByTestId("alert-sound").click();
    const tab2 = await ctx.newPage();
    await tab2.goto(`${APP}/en/dashboard`);
    await tab2.getByTestId("alert-sound").waitFor({ timeout: 15000 });
    ok("the switch is the same in every tab (off)", (await tab2.getByTestId("alert-sound").getAttribute("aria-checked")) === "false");
    await sleep(2500);
    const osc1 = await page.evaluate(() => window.__osc);
    const cust2 = sql(`insert into customers (business_id, whatsapp_phone, name) values ('${biz}', '237670555002', 'Joel Fon') returning id`).split("\n")[0];
    const conv2 = sql(`insert into conversations (business_id, customer_id, status, ai_enabled, human_requested, unread_count, last_message_at, last_customer_message_at) values ('${biz}', '${cust2}', 'open', true, true, 1, now(), now()) returning id`).split("\n")[0];
    await until(async () => /^\(2\) /.test(await page.title()) && /^\(2\) /.test(await tab2.title()));
    await sleep(1500);
    const notesBoth = (await page.evaluate(() => window.__notes.length)) + (await tab2.evaluate(() => window.__notes.length));
    ok("both tabs show (2); the sound is off, so no chime — the notification still comes, once for both tabs", /^\(2\) /.test(await page.title()) && /^\(2\) /.test(await tab2.title()) && (await page.evaluate(() => window.__osc)) === osc1 && (await tab2.evaluate(() => window.__osc)) === 0 && notesBoth === 3, `${await page.title()} | ${await tab2.title()} | notes ${notesBoth}`);
    await tab2.close();

    // ---------------------------------------------------------------- resolved: the count goes
    sql(`update conversations set status = 'resolved' where id in ('${conv}', '${conv2}')`);
    const cleared = await until(async () => !/^\(\d+\)/.test(await page.title()) && (await page.getByTestId("handoff-count").count()) === 0);
    ok("once the threads are resolved the tab title and the counter clear", cleared, await page.title());

    // A thread the team took over (Human Mode) counts too, until resolved.
    sql(`update conversations set status = 'open', human_requested = false, ai_enabled = false where id = '${conv}'`);
    ok("a thread in Human Mode (the team took it over) counts as waiting", await until(async () => /^\(1\) /.test(await page.title())), await page.title());

    // ---------------------------------------------------------------- the endpoint
    const anon = await fetch(`${APP}/api/dashboard/handoffs`);
    const mine = await page.evaluate(async () => (await fetch("/api/dashboard/handoffs")).json());
    ok("the queue endpoint: signed out → 401; a member gets only their business's waiting threads", anon.status === 401 && mine.count === 1 && mine.items.length === 1 && mine.items[0].id === conv, `${anon.status} ${JSON.stringify(mine)}`);
    await ctx.close();

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
