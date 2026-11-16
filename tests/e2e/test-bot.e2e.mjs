/*
 * End-to-end test of "Test AI Bot" (the dashboard header's simulator): the
 * assistant's test chat in a slide-over, a badge under each reply (the AI
 * kept the chat, or it went to the team and why), and a hand-over landing in
 * the Live Handoff Queue as the member's TEST chat — tab badge and chime —
 * without anything sent on WhatsApp or counted. Owners and the WazaBolt team
 * see the button; managers don't.
 *
 *   DATABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tests/e2e/test-bot.e2e.mjs
 */
import { execFileSync } from "node:child_process";

import { startFakeAnthropic } from "./fake-anthropic.mjs";
import { startFakeGraph } from "./fake-graph.mjs";
import { chromium } from "./playwright.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.DATABASE_URL;
if (!DB || !SERVICE) throw new Error("Set DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

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
async function until(fn, ms = 25000) {
  for (let t = 0; t < ms; t += 250) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
}
async function createMember(email, name, biz, role) {
  const u = await (
    await fetch(`${SUPABASE}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Wazabolt2026", email_confirm: true, user_metadata: { full_name: name, setup: "later" } }),
    })
  ).json();
  sql(`insert into business_members (business_id, user_id, role) values ('${biz}', '${u.id}', '${role}')`);
  return u.id;
}
async function login(page, email) {
  await page.goto(`${APP}/en/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Wazabolt2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

/** Records chimes (two oscillators each) and notifications instead of playing / showing them. */
const RECORDERS = () => {
  window.__osc = 0;
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
};

(async () => {
  const stamp = Date.now();
  const O = { name: "Bih Fon", business: `Bih Boutique ${stamp}`, email: `testbot-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const graph = await startFakeGraph(4010);
  const claude = await startFakeAnthropic(4020);
  const browser = await chromium.launch();
  const errors = [];
  try {
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
    sql(`insert into products (business_id, name, price, stock_quantity) values ('${biz}', 'Robe Ankara', 15000, 5)`);
    // Room for the extra members below (manager, WazaBolt team, staff).
    sql(`update subscriptions set plan_id = 'multishop' where business_id = '${biz}'`);

    // The counter sound on, so the queue's chime can be heard (and counted).
    await page.goto(`${APP}/en/dashboard/conversations`);
    const sw = page.getByTestId("alert-sound");
    await sw.waitFor({ timeout: 15000 });
    await sleep(1500);
    await sw.click();
    const osc0 = await page.evaluate(() => window.__osc);
    ok("the queue starts with nothing waiting (the sample chat doesn't count)", !/^\(\d+\)/.test(await page.title()), await page.title());

    // ---------------------------------------------------------------- the slide-over
    const button = page.getByTestId("test-bot-button");
    ok("owner: Test AI Bot is in the header", (await button.count()) === 1 && (await button.getAttribute("aria-label")) === "Test AI Bot");
    await button.click();
    const panel = page.getByTestId("test-bot-panel");
    await panel.waitFor({ timeout: 10000 });
    ok("it opens a slide-over chat, in test mode (nothing sent on WhatsApp)", (await panel.getByText(/Nothing is sent on WhatsApp/).count()) === 1);
    const input = panel.getByLabel("Write as a customer would…");
    await input.fill("Bonjour, la robe Ankara c'est combien ? C'est pour un mariage.");
    await input.press("Enter");
    await panel.getByText("La Robe Ankara coûte 15000 XAF.").waitFor({ timeout: 20000 });
    ok("the assistant answers from the live catalog", (await panel.getByText("Looked up: catalog").count()) === 1);
    ok("badge: AI kept the chat", (await panel.getByTestId("decision-ai").count()) === 1 && (await panel.getByTestId("decision-escalate").count()) === 0);

    await input.fill("Je veux parler à quelqu'un");
    await input.press("Enter");
    await panel.getByTestId("decision-escalate").waitFor({ timeout: 20000 });
    const esc = await panel.getByTestId("decision-escalate").innerText();
    ok("badge: handed to the team, with the reason", /Would hand this conversation to your team/.test(esc) && /Reason:/.test(esc), esc);
    ok("…and it's now in the Live Handoff Queue (TEST)", (await panel.getByTestId("decision-queued").count()) === 1);

    const row = sql(
      `select c.status || ' ' || c.ai_enabled || ' ' || c.human_requested || ' ' || c.is_sample || ' ' || c.is_test || ' ' || (c.handoff_expires_at > now() + interval '29 minutes') || ' ' || (select count(*) from messages m where m.conversation_id = c.id) from conversations c where c.business_id = '${biz}' and c.is_test`,
    );
    ok("one TEST conversation, with the team, 30 minutes on the clock, the transcript inside", row === "pending false true true true true 4", row);

    // The queue: the watcher picks it up — tab badge and chime.
    await page.keyboard.press("Escape");
    const titled = await until(async () => /^\(1\) /.test(await page.title()));
    ok("the Live Handoff Queue picks it up: (1) on the tab", titled, await page.title());
    ok("…with the counter chime", await until(async () => (await page.evaluate(() => window.__osc)) > osc0, 5000));
    const queue = await (await page.request.get(`${APP}/api/dashboard/handoffs`)).json();
    ok("the queue item is marked as a test", queue.count === 1 && queue.items[0].test === true, JSON.stringify(queue).slice(0, 200));

    await page.goto(`${APP}/en/dashboard/conversations`);
    const item = page.locator("main").getByRole("link").filter({ hasText: "Test chat" });
    ok("the inbox lists it with a TEST badge", (await item.count()) === 1 && /test/i.test(await item.getByTestId("sample-badge").innerText()));
    await item.click();
    await page.waitForURL(/\/dashboard\/conversations\/[0-9a-f-]{36}/);
    ok("opened: the transcript and a note that replies aren't sent", (await page.getByText("Je veux parler à quelqu'un").count()) >= 1 && (await page.getByText(/A test chat from Test AI Bot: replies aren't sent anywhere/).count()) === 1);

    ok("nothing was sent on WhatsApp", graph.sent().sent.length === 0);
    ok(
      "the test chat isn't a customer and isn't counted",
      sql(`select count(*) from customers where business_id = '${biz}' and is_test and is_sample`) === "1" &&
        (await (await page.request.get(`${APP}/en/dashboard/customers`)).text()).includes(`Test chat · ${O.name}`) === false,
    );
    // "Clear sample data" keeps it (it goes with Clear test).
    ok("Clear sample data leaves the test chat alone", sql(`begin; select set_config('request.jwt.claims', json_build_object('sub', (select user_id::text from business_members where business_id = '${biz}' and role = 'owner'), 'role', 'authenticated')::text, true); select public.clear_sample_data('${biz}') is not null; commit;`).includes("t") && sql(`select count(*) from conversations where business_id = '${biz}' and is_test`) === "1" && sql(`select count(*) from conversations where business_id = '${biz}' and is_sample and not is_test`) === "0");

    // Clear test: out of the queue and the inbox.
    await page.getByTestId("test-bot-button").click();
    await page.getByTestId("test-bot-panel").getByTestId("clear-test").click();
    await page.getByTestId("test-bot-panel").getByText("Test chat removed from the queue.").waitFor({ timeout: 10000 });
    ok("Clear test removes it", sql(`select count(*) from conversations where business_id = '${biz}' and is_test`) === "0" && sql(`select count(*) from customers where business_id = '${biz}' and is_test`) === "0");
    await page.keyboard.press("Escape");

    // ---------------------------------------------------------------- who sees it
    const managerEmail = `testbot-manager+${stamp}@example.com`;
    await createMember(managerEmail, "Mo Manager", biz, "admin");
    const mctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const mp = await mctx.newPage();
    await login(mp, managerEmail);
    await mp.goto(`${APP}/en/dashboard`);
    ok("a manager doesn't get the header button (the AI section's Test chat stays)", (await mp.getByTestId("test-bot-button").count()) === 0);
    const mres = await mp.request.post(`${APP}/api/ai/test-chat`, { data: { message: "Je veux parler à quelqu'un", history: [], language: null, queue: true } });
    ok("…but can still use the test chat itself", mres.status() === 200);

    const adminEmail = `testbot-wb+${stamp}@example.com`;
    const adminId = await createMember(adminEmail, "Waza Team", biz, "agent");
    sql(`insert into platform_admins (user_id) values ('${adminId}')`);
    const actx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const ap = await actx.newPage();
    await login(ap, adminEmail);
    await ap.goto(`${APP}/en/dashboard`);
    ok("the WazaBolt team gets the button in a business they belong to (demos), even as staff", (await ap.getByTestId("test-bot-button").count()) === 1);
    const ares = await (await ap.request.post(`${APP}/api/ai/test-chat`, { data: { message: "Bonjour, la robe Ankara c'est combien ? C'est pour un mariage.", history: [], language: null, queue: true } })).json();
    ok("…and can use it", ares.ok === true);
    sql(`delete from platform_admins where user_id = '${adminId}'`);

    const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const sp = await sctx.newPage();
    const staffEmail = `testbot-staff+${stamp}@example.com`;
    await createMember(staffEmail, "Sam Staff", biz, "agent");
    await login(sp, staffEmail);
    await sp.goto(`${APP}/en/dashboard`);
    ok("staff don't get it", (await sp.getByTestId("test-bot-button").count()) === 0);
    const sres = await sp.request.post(`${APP}/api/ai/test-chat`, { data: { message: "x", history: [], language: null, queue: true } });
    ok("…and the endpoint refuses them", sres.status() === 403, String(sres.status()));
    await page.screenshot({ path: "test-results/test-bot.png", fullPage: false });
  } catch (e) {
    results.push(`CRASH ${e?.stack ?? e}`);
    process.exitCode = 1;
  } finally {
    ok("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
    await browser.close();
    graph.close?.();
    claude.close?.();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
