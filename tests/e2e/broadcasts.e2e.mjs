/*
 * End-to-end test of Stage 8 (broadcasts) against a local Supabase stack and
 * the fake Graph API (port 4010, with templates): consent on the customer
 * page, a broadcast submitted as a MARKETING template, Meta's approval,
 * sending to the right audience, STOP / START, opted-out customers skipped,
 * and the daily job resuming an interrupted broadcast.
 *
 * Start the app as for the notifications suite (CRON_SECRET=test-cron), then:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... WHATSAPP_APP_SECRET=... npm run test:e2e:broadcasts
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
// The fake Graph API numbers its message ids from 1 each run: scope database checks to this run.
const RUN_STARTED = new Date().toISOString();
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
// products / order_items: cost columns are private, so ask for named columns, never *.
const returning = (path) => (/^(products|order_items)(\?|$)/.test(path) && !path.includes("select=") ? `${path}${path.includes("?") ? "&" : "?"}select=id,business_id,name,price,currency,stock_quantity,active` : path);
const post = async (tok, path, body) => (await fetch(`${SUPABASE}/rest/v1/${returning(path)}`, { method: "POST", headers: restHeaders(tok), body: JSON.stringify(body) })).json();
const patch = (tok, path, body) => fetch(`${SUPABASE}/rest/v1/${path}`, { method: "PATCH", headers: restHeaders(tok), body: JSON.stringify(body) });

async function inbound(from, name, text) {
  const body = JSON.stringify({
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
              messages: [{ from, id: `wamid.BC${Date.now()}${Math.random()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
  await fetch(`${APP}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex") },
    body,
  });
}

mkdirSync("test-results", { recursive: true });

(async () => {
  const graph = await startFakeGraph(4010);
  const sentTo = (phone) => graph.sent().sent.filter((m) => m.to === phone);
  const stamp = Date.now();
  const U = { name: "Awa Nkeng", business: "Awa Styles", email: `bc+${stamp}@example.com`, password: "Wazabolt2026" };
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
  sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${biz.id}'`);
  await patch(tok, `ai_settings?business_id=eq.${biz.id}`, { ai_enabled: false });

  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
  await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
  await main.getByRole("button", { name: "Connect WhatsApp" }).click();
  await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });

  const ANA = "237670003331";
  const BOB = "237670003332";
  const CARA = "237670003333";
  const lang = (l) => ({ preferred_language: l, preferred_language_source: "set_by_business" });
  await post(tok, "customers", { business_id: biz.id, whatsapp_phone: ANA, name: "Ana", tags: ["vip"], marketing_opt_in: true, ...lang("fr") });
  const [bob] = await post(tok, "customers", { business_id: biz.id, whatsapp_phone: BOB, name: "Bob", tags: [], ...lang("en") });
  await post(tok, "customers", { business_id: biz.id, whatsapp_phone: CARA, name: "Cara", tags: ["vip"], marketing_opt_in: true, ...lang("fr") });

  // Consent recorded from the customer page.
  await page.goto(`${APP}/en/dashboard/customers/${bob.id}`);
  await main.getByLabel("Agreed to receive promotions").check();
  await main.getByRole("button", { name: "Save" }).first().click();
  await main.getByText("Saved.").first().waitFor({ timeout: 10000 });
  const [bobRow] = await get(tok, `customers?select=marketing_opt_in,marketing_opt_in_at&id=eq.${bob.id}`);
  ok("consent ticked on the customer page, with its date", bobRow.marketing_opt_in === true && !!bobRow.marketing_opt_in_at);

  await page.goto(`${APP}/en/dashboard/broadcasts`);
  ok("broadcasts page counts subscribed customers", (await main.getByText("3 customers agreed to receive promotions.").count()) === 1);

  // A broadcast to VIP customers, in French, with their name.
  await main.getByRole("link", { name: "New broadcast" }).click();
  await page.waitForURL(/\/broadcasts\/new/);
  await main.getByLabel("Name (for your team)").fill("Nouveautés VIP");
  await main.getByLabel("Language of the message").selectOption("fr");
  await main.getByLabel("Message", { exact: true }).fill("Nos nouveaux pagnes wax sont arrivés ! -10 % pour vous ce week-end.");
  await main.getByLabel(/Only customers with these tags/).fill("vip");
  await main.getByRole("button", { name: "Save and submit to Meta" }).click();
  await page.waitForURL(/\/broadcasts\/[0-9a-f-]{36}$/);
  const broadcastUrl = page.url();
  const tpl = graph.templates().find((t) => t.name.startsWith("wazabolt_bc_"));
  ok(
    "broadcast submitted as a MARKETING template with the name greeting and the STOP line",
    tpl?.category === "MARKETING" && tpl.language === "fr" && tpl.components[0].text.startsWith("Bonjour {{1}}, Nos nouveaux pagnes") && tpl.components[0].text.endsWith("Répondez STOP pour ne plus recevoir de promotions.") && tpl.components[0].example.body_text[0][0] === "Brenda",
    JSON.stringify(tpl?.components),
  );
  ok("in review, with a preview and the matching audience", (await main.getByText("In review").count()) >= 1 && (await main.getByText(/Bonjour Brenda, Nos nouveaux pagnes/).count()) === 1 && (await main.getByText("2 subscribed customers match right now.").count()) === 1);
  graph.approveAll();
  await main.getByRole("button", { name: "Refresh status" }).click();
  await main.getByRole("button", { name: "Send to 2 customers" }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: "test-results/stage8-broadcast.png", fullPage: true });
  await main.getByRole("button", { name: "Send to 2 customers" }).click();
  await waitFor(() => sentTo(ANA).length && sentTo(CARA).length);
  const anaMsg = sentTo(ANA)[0];
  ok("sent to the VIP audience only, with each customer's name", anaMsg?.template?.name === tpl.name && anaMsg.template.components[0].parameters[0].text === "Ana" && sentTo(CARA)[0]?.template.components[0].parameters[0].text === "Cara" && sentTo(BOB).length === 0);
  await page.goto(broadcastUrl);
  await main.getByText("Sent 2 of 2 · 0 failed").waitFor({ timeout: 15000 }).catch(() => {});
  // Each message row is written just after its send: give the last one a moment.
  const marketingRows = () => sql(`select count(*) from messages where whatsapp_message_id in ('${sentTo(CARA)[0]?.wamid}', '${anaMsg?.wamid}') and wa_category = 'marketing' and created_at >= '${RUN_STARTED}'`);
  for (let i = 0; i < 20 && marketingRows() !== "2"; i++) await sleep(500);
  ok("broadcast messages are recorded as marketing", marketingRows() === "2");
  ok("progress and recipients shown", (await main.getByText("Sent 2 of 2 · 0 failed").count()) === 1 && (await main.getByText("Sent", { exact: true }).count()) >= 2);

  // STOP and START from WhatsApp.
  await inbound(ANA, "Ana", "Stop");
  const stopped = await waitFor(async () => (await get(tok, `customers?select=marketing_opt_in&whatsapp_phone=eq.${ANA}`))[0]?.marketing_opt_in === false);
  const stopReply = await waitFor(() => sentTo(ANA).find((m) => m.type === "text"));
  ok("STOP unsubscribes and confirms in the customer's language", !!stopped && stopReply?.text.body.startsWith("C'est noté — vous ne recevrez plus de promotions de Awa Styles."), stopReply?.text.body);
  await inbound(ANA, "Ana", "START");
  ok("START subscribes again", !!(await waitFor(async () => (await get(tok, `customers?select=marketing_opt_in&whatsapp_phone=eq.${ANA}`))[0]?.marketing_opt_in === true)));

  // An interrupted broadcast (audience frozen, then Bob opts out) is finished by the daily job, skipping Bob.
  await page.goto(`${APP}/en/dashboard/broadcasts/new`);
  await main.getByLabel("Name (for your team)").fill("Everyone");
  await main.getByLabel("Language of the message").selectOption("en");
  await main.getByLabel("Message", { exact: true }).fill("We're open on Sunday this week!");
  await main.getByLabel("Start with the customer's name").uncheck();
  await main.getByRole("button", { name: "Save and submit to Meta" }).click();
  await page.waitForURL(/\/broadcasts\/[0-9a-f-]{36}$/);
  const second = page.url().split("/").pop();
  graph.approveAll();
  sql(`update public.broadcasts set template_status = 'approved' where id = '${second}'; select public.prepare_broadcast('${second}');
       update public.customers set marketing_opt_in = false where id = '${bob.id}'`);
  const run = await (await fetch(`${APP}/api/cron/reminders`, { headers: { authorization: `Bearer ${CRON}` } })).json();
  const [done] = await get(tok, `broadcasts?select=status,recipients_count,sent_count&id=eq.${second}`);
  const recips = await get(tok, `broadcast_recipients?select=status,customers(name)&broadcast_id=eq.${second}`);
  ok(
    "the daily job finishes it; a customer who opted out meanwhile is skipped",
    run.ok && done.status === "sent" && done.recipients_count === 3 && done.sent_count === 2 && recips.find((r) => r.customers.name === "Bob")?.status === "skipped" && sentTo(BOB).length === 0,
    JSON.stringify({ done, recips }),
  );
  ok("no parameters when the broadcast isn't personalised", sentTo(CARA).at(-1)?.template.components.length === 0);

  // Phone layout + French.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/dashboard/broadcasts", "/dashboard/broadcasts/new", new URL(broadcastUrl).pathname.replace(/^\/en/, "")]) {
    await page.goto(`${APP}/en${p}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`no horizontal overflow at 390px on ${p.split("/").slice(0, 3).join("/")}${p.split("/").length > 3 ? "/…" : ""}`, over <= 1, `+${over}px`);
  }
  await page.goto(`${APP}/fr/dashboard/broadcasts`);
  ok("broadcasts in French", (await main.getByRole("heading", { name: "Diffusions" }).count()) === 1);

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
