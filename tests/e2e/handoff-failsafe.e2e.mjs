/*
 * The handoff failsafe: a chat left with the team goes back to the AI
 * assistant after 30 minutes, so no customer is stranded.
 *
 *  - the 30 minutes start when the chat goes to the team, and again with
 *    each reply from the team; the team can extend them (+30 min);
 *  - a customer message after that: the assistant takes the chat back (a
 *    note in the thread, never sent, kept out of its history) and answers;
 *  - the cleanup (while a dashboard is open) hands back idle threads where
 *    the team spoke last — never one where the customer is still waiting;
 *  - only where the assistant really answers: before launch nothing resumes
 *    and no countdown is shown.
 *
 *   APP_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_ANON_KEY=... WHATSAPP_APP_SECRET=... DATABASE_URL=... \
 *   node tests/e2e/handoff-failsafe.e2e.mjs
 * (the app pointed at the fake Graph API on :4010 and the fake Claude API on :4020)
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

import { chromium } from "./playwright.mjs";
import { startFakeAnthropic } from "./fake-anthropic.mjs";
import { FAKE, startFakeGraph } from "./fake-graph.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SECRET = process.env.WHATSAPP_APP_SECRET;
const DB = process.env.DATABASE_URL;
if (!SECRET || !DB) throw new Error("Set WHATSAPP_APP_SECRET and DATABASE_URL");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) {
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
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json();
    const m = list.messages?.find((x) => x.Subject.includes(subjectIncludes));
    if (m) return (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    await sleep(500);
  }
  return null;
}
const linkFrom = (mail) => (mail?.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&");
let seq = 0;
async function deliver(body, from = "237670444001", name = "Esther Bih") {
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
              messages: [{ from, id: `wamid.HF${Date.now()}${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  const res = await fetch(`${APP}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex") },
    body: raw,
  });
  return res.status;
}
/** Minutes until the thread's handoff expires (rounded), or null. */
const minutesLeft = (conv) => {
  const v = sql(`select round(extract(epoch from handoff_expires_at - now()) / 60) from conversations where id = '${conv}'`);
  return v === "" ? null : Number(v);
};

(async () => {
  const graph = await startFakeGraph(4010);
  const claude = await startFakeAnthropic(4020);
  const stamp = Date.now();
  const O = { name: "Awa Nkeng", business: `Awa Styles ${stamp}`, email: `failsafe-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const errors = [];
  const aiReplies = () => graph.sent().sent.filter((m) => m.to === "237670444001" && m.type === "text").length;
  try {
    // A shop with WhatsApp connected and the AI assistant live (launched, with the add-on).
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const main = page.locator("main");
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
    await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 15000 });
    const biz = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${O.email}'`);
    await page.goto(`${APP}/en/dashboard/whatsapp`);
    await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
    await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
    await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
    await main.getByRole("button", { name: "Connect WhatsApp" }).click();
    await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });
    sql(`select public.admin_set_ai_launched(true); update public.subscriptions set addon_id = 'ai_plus' where business_id = '${biz}'`);

    // The customer writes; the assistant answers.
    await deliver("Hello, do you have wax dresses?");
    await waitFor(() => aiReplies() >= 1);
    const conv = sql(`select c.id from conversations c join customers cu on cu.id = c.customer_id where c.business_id = '${biz}' and cu.whatsapp_phone = '237670444001'`);
    ok("the assistant answers the customer (live)", aiReplies() === 1 && sql(`select ai_enabled from conversations where id = '${conv}'`) === "t" && minutesLeft(conv) === null);

    // ---------------------------------------------------------------- the team takes over: 30 minutes
    await page.goto(`${APP}/en/dashboard/conversations/${conv}`);
    await main.getByRole("button", { name: "Take Over" }).click();
    await waitFor(() => sql(`select ai_enabled from conversations where id = '${conv}'`) === "f", 10000);
    ok("taking the chat over starts the 30 minutes", minutesLeft(conv) === 30, String(minutesLeft(conv)));
    await page.reload();
    const badge = page.getByTestId("conversation-drawer").getByTestId("handoff-countdown");
    await waitFor(async () => /AI resumes in (29|30)m/.test(await badge.innerText().catch(() => "")), 10000);
    ok("the conversation shows the countdown: AI resumes in 30m", /AI resumes in (29|30)m/.test(await badge.innerText()), await badge.innerText());
    await page.getByTestId("conversation-drawer").getByRole("button", { name: "Extend +30m" }).click();
    await waitFor(() => minutesLeft(conv) === 60, 10000);
    await waitFor(async () => /AI resumes in (59|60)m/.test(await badge.innerText().catch(() => "")), 10000);
    ok("Extend +30m: an hour left, the badge follows", minutesLeft(conv) === 60 && /AI resumes in (59|60)m/.test(await badge.innerText()));
    await page.goto(`${APP}/en/dashboard/conversations`);
    ok("the list shows the countdown on the chat too", /AI resumes in (59|60)m/.test(await main.getByTestId("handoff-countdown").first().innerText().catch(() => "")));

    // A team reply restarts the 30 minutes.
    sql(`update conversations set handoff_expires_at = now() + interval '5 minutes' where id = '${conv}'`);
    await page.goto(`${APP}/en/dashboard/conversations/${conv}`);
    await page.locator("#composer-text").fill("Yes — which size do you need?");
    await main.getByRole("button", { name: "Send", exact: true }).click();
    await waitFor(() => minutesLeft(conv) === 30, 10000);
    ok("a reply from the team restarts the 30 minutes", minutesLeft(conv) === 30, String(minutesLeft(conv)));

    // ---------------------------------------------------------------- the customer writes within the 30 minutes: the team keeps it
    // (the team's own reply goes out through WhatsApp too: count from after it)
    await waitFor(() => graph.sent().sent.some((m) => m.text?.body === "Yes — which size do you need?"), 10000);
    const before = aiReplies();
    await deliver("Size M please");
    await sleep(4000);
    ok("within the 30 minutes the team keeps the chat (no AI reply)", aiReplies() === before && sql(`select ai_enabled from conversations where id = '${conv}'`) === "f");

    // ---------------------------------------------------------------- 30 minutes later, the customer writes again: the assistant takes it back
    sql(`update conversations set handoff_expires_at = now() - interval '1 minute' where id = '${conv}'`);
    const claudeBefore = claude.requests.length;
    await deliver("Hello? Is anyone there?");
    await waitFor(() => aiReplies() > before);
    ok("past the 30 minutes, the customer's message goes to the assistant, which answers", aiReplies() === before + 1);
    ok(
      "…the chat is back with the assistant (Human Mode off, no request, no timer) with a note in the thread",
      sql(`select ai_enabled || ' ' || human_requested || ' ' || coalesce(handoff_expires_at::text, 'none') from conversations where id = '${conv}'`) === "true false none" &&
        sql(`select content from messages where conversation_id = '${conv}' and sender_type = 'system' and payload ->> 'note' = 'ai_resumed'`) === "AI resumed after 30m idle",
    );
    const sentToClaude = JSON.stringify(claude.requests.slice(claudeBefore).map((r) => r.body.messages));
    ok("…the note is never sent to the customer, nor shown to the assistant", !graph.sent().sent.some((m) => m.text?.body?.includes("AI resumed")) && !sentToClaude.includes("AI resumed") && sentToClaude.includes("Is anyone there"));
    await page.goto(`${APP}/en/dashboard/conversations/${conv}`);
    await main.getByTestId("ai-resumed-note").waitFor({ timeout: 10000 });
    ok("the team sees the note in the thread, and no countdown any more", /AI resumed after 30m idle/.test(await main.getByTestId("ai-resumed-note").innerText()) && (await page.getByTestId("conversation-drawer").getByTestId("handoff-countdown").count()) === 0);

    // ---------------------------------------------------------------- the cleanup (while a dashboard is open)
    // Idle: the team spoke last and the time is up → back to the assistant.
    sql(`update conversations set ai_enabled = false where id = '${conv}'`);
    sql(`insert into messages (business_id, conversation_id, direction, sender_type, message_type, content) values ('${biz}', '${conv}', 'outbound', 'agent', 'text', 'Anything else?')`);
    sql(`update conversations set handoff_expires_at = now() - interval '1 minute' where id = '${conv}'`);
    // Waiting: another customer's last message is theirs → stays with the team.
    const cust2 = sql(`insert into customers (business_id, whatsapp_phone, name) values ('${biz}', '237670444002', 'Joel Fon') returning id`).split("\n")[0];
    const waiting = sql(`insert into conversations (business_id, customer_id, status, ai_enabled, human_requested, last_message_at, last_customer_message_at) values ('${biz}', '${cust2}', 'open', false, true, now(), now()) returning id`).split("\n")[0];
    sql(`insert into messages (business_id, conversation_id, direction, sender_type, message_type, content) values ('${biz}', '${waiting}', 'inbound', 'customer', 'text', 'I need to speak to someone')`);
    sql(`update conversations set handoff_expires_at = now() - interval '1 minute' where id = '${waiting}'`);
    await page.goto(`${APP}/en/dashboard`);
    await waitFor(() => sql(`select ai_enabled from conversations where id = '${conv}'`) === "t", 25000);
    ok("cleanup: an idle chat (the team spoke last) goes back to the assistant", sql(`select ai_enabled from conversations where id = '${conv}'`) === "t" && sql(`select count(*) from messages where conversation_id = '${conv}' and payload ->> 'note' = 'ai_resumed'`) === "2");
    ok("…but a customer still waiting for an answer stays in the team's queue", sql(`select ai_enabled || ' ' || human_requested from conversations where id = '${waiting}'`) === "false true");

    // ---------------------------------------------------------------- before launch: nothing resumes, no countdown
    sql(`select public.admin_set_ai_launched(false)`);
    sql(`update conversations set ai_enabled = false where id = '${conv}'`);
    sql(`update conversations set handoff_expires_at = now() - interval '1 minute' where id = '${conv}'`);
    const quiet = aiReplies();
    await deliver("Hello again");
    await sleep(4000);
    ok("AI not launched: the chat stays with the team, nothing is sent", aiReplies() === quiet && sql(`select ai_enabled from conversations where id = '${conv}'`) === "f");
    await page.goto(`${APP}/en/dashboard/conversations/${conv}`);
    await main.getByRole("heading", { level: 1 }).waitFor({ timeout: 10000 });
    ok("…and no countdown is shown (nothing would resume)", (await page.getByTestId("handoff-countdown").count()) === 0 && (await main.getByRole("button", { name: "Extend +30m" }).count()) === 0);
    await ctx.close();

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    graph.close();
    claude.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
