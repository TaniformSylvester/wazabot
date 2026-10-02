/*
 * End-to-end test of Stage 7 (customer notifications) against a local
 * Supabase stack and the fake Graph API (port 4010, with message templates):
 * submitting WazaBolt's templates, Meta's review (refresh + webhook), order
 * updates inside the 24-hour window (text) and outside it (template), no
 * duplicates, the follow-up template, appointment confirmations,
 * cancellations and the daily reminder job, and the on/off settings.
 *
 * Start the app as for the WhatsApp suite, plus CRON_SECRET=test-cron, then:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... WHATSAPP_APP_SECRET=... npm run test:e2e:notifications
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { FAKE, startFakeGraph } from "./fake-graph.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB = process.env.DATABASE_URL;
const SECRET = process.env.WHATSAPP_APP_SECRET;
const CRON = process.env.CRON_SECRET ?? "test-cron";
if (!ANON || !DB || !SECRET) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL and WHATSAPP_APP_SECRET");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(400);
  }
  return null;
}
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
const restHeaders = (tok) => ({ apikey: ANON, authorization: `Bearer ${tok}`, "content-type": "application/json", prefer: "return=representation" });
const get = async (tok, path) => (await fetch(`${SUPABASE}/rest/v1/${path}`, { headers: restHeaders(tok) })).json();
const post = async (tok, path, body) => (await fetch(`${SUPABASE}/rest/v1/${path}`, { method: "POST", headers: restHeaders(tok), body: JSON.stringify(body) })).json();
const patch = (tok, path, body) => fetch(`${SUPABASE}/rest/v1/${path}`, { method: "PATCH", headers: restHeaders(tok), body: JSON.stringify(body) });
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86_400_000));

async function webhook(payload) {
  const body = JSON.stringify(payload);
  return fetch(`${APP}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex") },
    body,
  });
}
const inbound = (from, name, text) =>
  webhook({
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
              messages: [{ from, id: `wamid.NT${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  });

mkdirSync("test-results", { recursive: true });

(async () => {
  const graph = await startFakeGraph(4010);
  const sentTo = (phone) => graph.sent().sent.filter((m) => m.to === phone);
  const stamp = Date.now();
  const U = { name: "Awa Nkeng", business: "Awa Styles", email: `notif+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  await page.goto(`${APP}/en/register`);
  await page.getByLabel("Your name").fill(U.name);
  await page.getByLabel("Business name").fill(U.business);
  await page.getByLabel("Email", { exact: true }).fill(U.email);
  await page.getByLabel("Password", { exact: true }).fill(U.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 10000 });
  await page.goto(linkFrom(await latestMail(U.email, "Confirm")));
  await page.waitForURL(/\/dashboard\/onboarding/);
  const tok = (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email: U.email, password: U.password }) })).json()).access_token;
  const [biz] = await get(tok, "businesses?select=id");
  sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now(), default_language = 'en', timezone = 'Africa/Douala',
       opening_hours = (select jsonb_object_agg(d, '{"closed":false,"open":"08:00","close":"18:00"}'::jsonb) from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d)
       where id = '${biz.id}'`);
  await patch(tok, `ai_settings?business_id=eq.${biz.id}`, { ai_enabled: false }); // these tests are about notifications, not AI replies

  // Notifications page before WhatsApp: asks to connect first.
  await page.goto(`${APP}/en/dashboard/whatsapp/notifications`);
  ok("notifications page explains WhatsApp must be connected first", (await main.getByText(/Connect WhatsApp first/).count()) === 1);

  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
  await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
  await main.getByRole("button", { name: "Connect WhatsApp" }).click();
  await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });

  // A customer who wrote (window open) and one who never did (window closed).
  const ANA = "237670001111";
  const BOB = "237670002222";
  await inbound(ANA, "Ana", "Bonjour");
  const [ana] = await waitFor(async () => {
    const r = await get(tok, `customers?select=id&whatsapp_phone=eq.${ANA}`);
    return r.length ? r : null;
  });
  const [bob] = await post(tok, "customers", { business_id: biz.id, whatsapp_phone: BOB, name: "Bob" });
  const [product] = await post(tok, "products", { business_id: biz.id, name: "Robe Ankara", price: 15000 });
  const order = async (customerId) => {
    const r = await fetch(`${SUPABASE}/rest/v1/rpc/create_order`, {
      method: "POST",
      headers: restHeaders(tok),
      body: JSON.stringify({ p_business_id: biz.id, p_customer_id: customerId, p_items: [{ product_id: product.id, quantity: 1 }] }),
    });
    return r.json();
  };
  const setStatus = async (orderId, status) => {
    await page.goto(`${APP}/en/dashboard/orders/${orderId}`);
    await main.getByLabel("Order status").selectOption(status);
    await main.getByRole("button", { name: "Save" }).click();
    await main.getByText("Order updated.").waitFor({ timeout: 10000 });
  };

  // Outside the window, before templates exist: not sent, and the order page says why.
  const bobOrder = await order(bob.id);
  await setStatus(bobOrder, "ready");
  await page.reload();
  await main.getByText("template not approved yet").waitFor({ timeout: 10000 }).catch(() => {});
  ok("outside 24 h without an approved template: not sent, reason shown on the order", sentTo(BOB).length === 0 && (await main.getByText("template not approved yet").count()) === 1);

  // Submit the templates; Meta approves; refresh.
  await page.goto(`${APP}/en/dashboard/whatsapp/notifications`);
  await main.getByRole("button", { name: "Submit templates to Meta" }).click();
  await waitFor(async () => (await main.getByText("In review").count()) === 16);
  const tpl = graph.templates();
  ok("all 16 templates submitted (8 messages × English, French), category UTILITY with examples", tpl.length === 16 && tpl.every((t) => t.category === "UTILITY" && t.components[0].example.body_text[0].length > 0) && (await main.getByText("In review").count()) === 16);
  graph.approveAll();
  await main.getByRole("button", { name: "Refresh status" }).click();
  await waitFor(async () => (await main.getByText("Approved", { exact: true }).count()) === 16);
  ok("refresh shows Meta's approval", (await main.getByText("Approved", { exact: true }).count()) === 16);

  // Meta's webhook can also report a review result.
  const rejected = tpl.find((t) => t.name === "wazabolt_order_delivered" && t.language === "fr");
  await webhook({ object: "whatsapp_business_account", entry: [{ id: FAKE.wabaId, changes: [{ field: "message_template_status_update", value: { event: "REJECTED", message_template_id: rejected.id, reason: "INVALID_FORMAT" } }] }] });
  await page.reload();
  ok("template status webhook updates the table", (await main.getByText("Rejected", { exact: true }).count()) === 1 && (await main.getByText("INVALID_FORMAT").count()) === 1);
  await page.screenshot({ path: "test-results/stage7-notifications.png", fullPage: true });

  // Inside the window: a normal text message.
  const anaOrder = await order(ana.id);
  await setStatus(anaOrder, "confirmed");
  const anaText = await waitFor(() => sentTo(ANA).find((m) => m.type === "text"));
  ok("inside 24 h: order confirmation sent as a normal message", anaText?.text.body.startsWith("Hello Ana, Awa Styles has confirmed your order ORD-0000"), anaText?.text.body);

  // Re-trying the earlier order now that templates are approved; saving again doesn't send twice.
  await setStatus(bobOrder, "ready");
  const bobTpl = await waitFor(() => sentTo(BOB).find((m) => m.type === "template"));
  ok("outside 24 h: the approved template, with parameters", bobTpl?.template.name === "wazabolt_order_ready" && bobTpl.template.language.code === "en" && bobTpl.template.components[0].parameters.map((p) => p.text).join("|") === "Bob|ORD-00001|Awa Styles", JSON.stringify(bobTpl?.template));
  await setStatus(bobOrder, "ready");
  await sleep(1500);
  ok("saving the same status again doesn't notify twice", sentTo(BOB).filter((m) => m.template?.name === "wazabolt_order_ready").length === 1);
  ok("the notification shows in the customer's conversation", (await get(tok, `messages?select=content,sender_type&sender_type=eq.system`)).some((m) => m.content === "Hello Bob, your order ORD-00001 at Awa Styles is ready."));
  ok("the template is recorded as a utility message", (await get(tok, `messages?select=content,wa_category&sender_type=eq.system`)).some((m) => m.content === "Hello Bob, your order ORD-00001 at Awa Styles is ready." && m.wa_category === "utility"));

  // Follow-up template from the conversation (window closed).
  const [bobConv] = await get(tok, `conversations?select=id&customer_id=eq.${bob.id}`);
  await page.goto(`${APP}/en/dashboard/conversations/${bobConv.id}`);
  await main.getByRole("button", { name: "Send follow-up template" }).click();
  const follow = await waitFor(() => sentTo(BOB).find((m) => m.template?.name === "wazabolt_follow_up"));
  ok("follow-up template sent from the conversation", !!follow);
  await main.getByRole("button", { name: "Send follow-up template" }).click();
  await main.getByText("A follow-up was already sent to this customer today.").waitFor({ timeout: 10000 });
  ok("only one follow-up per day", sentTo(BOB).filter((m) => m.template?.name === "wazabolt_follow_up").length === 1);

  // Appointments: booked and cancelled from the dashboard, reminder from the daily job.
  sql(`update public.booking_settings set enabled = true, min_notice_minutes = 0 where business_id = '${biz.id}';
       insert into public.services (business_id, name, duration_minutes, price) values ('${biz.id}', 'Tresses', 60, 5000)`);
  await page.goto(`${APP}/en/dashboard/appointments/new?customer=${bob.id}`);
  await main.getByLabel("Date").fill(tomorrow);
  await waitFor(async () => (await main.getByLabel("Time").locator("option").count()) > 5);
  await main.getByLabel("Time").selectOption("10:00");
  await main.getByRole("button", { name: "Book" }).click();
  await page.waitForURL(/\/dashboard\/appointments\?booked=1/);
  const booked = await waitFor(() => sentTo(BOB).find((m) => m.template?.name === "wazabolt_appointment_booked"));
  ok("appointment booked from the dashboard → confirmation template", booked?.template.components[0].parameters[1].text === "Tresses" && /10:00/.test(booked.template.components[0].parameters[3].text), JSON.stringify(booked?.template.components));
  await main.getByRole("button", { name: "Cancel" }).first().click();
  const cancelled = await waitFor(() => sentTo(BOB).find((m) => m.template?.name === "wazabolt_appointment_cancelled"));
  ok("appointment cancelled from the dashboard → cancellation template", !!cancelled);

  // Daily reminder job: an appointment in ~20 hours.
  sql(`insert into public.appointments (business_id, customer_id, service_name, starts_at, ends_at)
       values ('${biz.id}', '${bob.id}', 'Tresses', now() + interval '20 hours', now() + interval '21 hours')`);
  ok("reminder job refuses calls without the secret", (await fetch(`${APP}/api/cron/reminders`)).status === 401);
  const run1 = await (await fetch(`${APP}/api/cron/reminders`, { headers: { authorization: `Bearer ${CRON}` } })).json();
  const reminder = sentTo(BOB).find((m) => m.template?.name === "wazabolt_appointment_reminder");
  const run2 = await (await fetch(`${APP}/api/cron/reminders`, { headers: { authorization: `Bearer ${CRON}` } })).json();
  ok("reminder job sends the reminder once", run1.sent >= 1 && !!reminder && run2.sent === 0 && sentTo(BOB).filter((m) => m.template?.name === "wazabolt_appointment_reminder").length === 1, JSON.stringify({ run1, run2 }));

  // Settings: order updates off → nothing sent.
  await page.goto(`${APP}/en/dashboard/whatsapp/notifications`);
  await main.getByLabel("Order updates").uncheck();
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("Notification settings saved.").waitFor({ timeout: 10000 });
  const before = sentTo(ANA).length;
  await setStatus(anaOrder, "delivered");
  await sleep(2000);
  ok("order updates switched off: nothing sent", sentTo(ANA).length === before);
  await page.goto(`${APP}/en/dashboard/whatsapp/notifications`);
  ok("recent notifications listed", (await main.getByText("Recently sent").count()) === 1 && (await main.getByText("Sent", { exact: true }).count()) >= 4);

  // Phone layout + French.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/dashboard/whatsapp/notifications", `/dashboard/orders/${bobOrder}`]) {
    await page.goto(`${APP}/en${p}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`no horizontal overflow at 390px on ${p.split("/").slice(0, 3).join("/")}`, over <= 1, `+${over}px`);
  }
  await page.goto(`${APP}/fr/dashboard/whatsapp/notifications`);
  ok("notifications page in French", (await main.getByRole("heading", { name: "Modèles de message" }).count()) === 1);

  // Leave the shared fake number free for other suites.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByRole("button", { name: "Disconnect" }).click();
  await main.getByRole("button", { name: "Disconnect" }).last().click();
  await main.getByText("Not Connected").waitFor({ timeout: 15000 });

  ok("no browser errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  graph.close();
  await browser.close();
  process.exit();
})().catch((e) => {
  console.error(e);
  console.log(results.join("\n"));
  process.exit(1);
});
