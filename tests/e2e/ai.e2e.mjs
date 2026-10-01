/*
 * End-to-end test of Stage 3 (AI replies) against a local Supabase stack, a
 * local fake of Meta's Graph API (tests/e2e/fake-graph.mjs) and a scripted
 * local fake of the Anthropic API (tests/e2e/fake-anthropic.mjs). Never the
 * real APIs: no cost, no customer messages.
 *
 * Start the app with the Stage 2 settings plus:
 *   ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://localhost:4020 AI_DEBOUNCE_MS=1500
 * then:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... WHATSAPP_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=... npm run test:e2e:ai
 */
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { startFakeAnthropic } from "./fake-anthropic.mjs";
import { FAKE, startFakeGraph } from "./fake-graph.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.WHATSAPP_APP_SECRET;
if (!ANON || !SECRET) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY and WHATSAPP_APP_SECRET");

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
const linkFrom = (mail) => (mail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&");
const restHeaders = (tok, extra = {}) => ({ apikey: ANON, authorization: `Bearer ${tok}`, "content-type": "application/json", ...extra });
const get = async (tok, path) => (await fetch(`${SUPABASE}/rest/v1/${path}`, { headers: restHeaders(tok) })).json();
const patch = (tok, path, body) => fetch(`${SUPABASE}/rest/v1/${path}`, { method: "PATCH", headers: restHeaders(tok), body: JSON.stringify(body) });
const post = (tok, path, body) => fetch(`${SUPABASE}/rest/v1/${path}`, { method: "POST", headers: restHeaders(tok, { prefer: "return=representation" }), body: JSON.stringify(body) });

let seq = 0;
async function deliver(message, from = "237670000123", name = "Chantal") {
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
              messages: [{ from, id: `wamid.AI${Date.now()}${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
            },
          },
        ],
      },
    ],
  };
  const body = JSON.stringify(payload);
  const res = await fetch(`${APP}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex") },
    body,
  });
  return res.json();
}
const text = (body) => ({ type: "text", text: { body } });

mkdirSync("test-results", { recursive: true });

(async () => {
  const graph = await startFakeGraph(4010);
  const claude = await startFakeAnthropic(4020);
  const sentTexts = () => graph.sent().sent.map((m) => m.text?.body ?? "");
  const stamp = Date.now();
  const U = { name: "Awa Nkeng", business: "Awa Styles", email: `ai+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  // Sign up + catalog + FAQ
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
  await post(tok, "products", { business_id: biz.id, name: "Robe Ankara", price: 15000, stock_quantity: 5 });
  await post(tok, "faqs", { business_id: biz.id, question: "Livrez-vous à Buea ?", answer: "Oui, la livraison à Buea coûte 2 500 XAF." });

  // Test chat works without WhatsApp: real lookups, nothing sent or saved.
  await page.goto(`${APP}/en/dashboard/ai/test`);
  ok("test chat page shows the test-mode notice", (await main.getByText(/Test mode: nothing is sent on WhatsApp/).count()) === 1);
  const chatInput = main.getByLabel("Write as a customer would…");
  await chatInput.fill("Bonjour, c'est combien la robe Ankara ?");
  await chatInput.press("Enter");
  await main.getByText("La Robe Ankara coûte 15000 XAF.").waitFor({ timeout: 20000 });
  ok("test chat: assistant answers from the catalog", (await main.getByText("Looked up: catalog").count()) === 1 && (await main.getByText("Reply language: French").count()) >= 1);
  await chatInput.fill("Je prends 2");
  await main.getByRole("button", { name: "Send" }).click();
  await main.getByText(/TEST-00001/).waitFor({ timeout: 20000 });
  ok("test chat: orders are simulated, not saved", (await get(tok, "orders?select=id")).length === 0 && (await main.getByText(/order \(simulated\)/).count()) === 1);
  await chatInput.fill("Je veux parler à quelqu'un");
  await chatInput.press("Enter");
  await main.getByText("Would hand this conversation to your team", { exact: false }).waitFor({ timeout: 20000 });
  ok("test chat: shows when it would hand over", true);
  ok("test chat: nothing sent on WhatsApp, no conversation created", graph.sent().sent.length === 0 && (await get(tok, "conversations?select=id")).length === 0);
  await page.screenshot({ path: "test-results/stage3-test-chat.png", fullPage: true });
  await main.getByRole("button", { name: "Start over" }).click();
  ok("test chat: start over clears the transcript", (await main.getByText("La Robe Ankara coûte 15000 XAF.").count()) === 0);

  // Before WhatsApp is connected the assistant isn't live.
  await page.goto(`${APP}/en/dashboard/ai`);
  ok("AI page: waiting for WhatsApp before connecting", (await main.getByText("Waiting for WhatsApp").count()) === 1);

  // Connect WhatsApp (fake Graph API)
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
  await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
  await main.getByRole("button", { name: "Connect WhatsApp" }).click();
  await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });
  await page.goto(`${APP}/en/dashboard/ai`);
  ok("AI page: assistant is Live once WhatsApp is connected", (await main.getByText("Live — answering customers on WhatsApp.").count()) === 1);

  // 1. A price question: catalog lookup, quoted from the catalog, in French.
  await deliver(text("Bonjour, c'est combien la robe Ankara ?"));
  const priceReply = await waitFor(() => sentTexts().find((t) => t.includes("15000")));
  ok("assistant answers a price question from the catalog", priceReply === "La Robe Ankara coûte 15000 XAF.", JSON.stringify(sentTexts()));
  const req = claude.requests[0];
  ok("Claude request: Opus 5.5, low effort, server-side fallback", req?.body.model === "claude-opus-5-5" && req.body.output_config?.effort === "low" && req.body.fallbacks === "default" && String(req.headers["anthropic-beta"]).includes("server-side-fallback-2026-07-01"));
  ok("Claude request: cached system prompt with the FAQ, tools end with send_reply", req.body.system.every((b) => b.cache_control) && req.body.system[1].text.includes("Livrez-vous à Buea ?") && req.body.tools.at(-1).name === "send_reply");
  ok("Claude request: turn context as a system message after the customer's message", req.body.messages.at(-1).role === "system" && req.body.messages.at(-1).content.includes("reply_language: French (fr)"));
  ok("the API key never reaches the browser", !(await page.content()).includes("test-key"));
  const [cust] = await get(tok, "customers?select=id,preferred_language,preferred_language_source");
  ok("customer's language remembered (inferred French)", cust.preferred_language === "fr" && cust.preferred_language_source === "inferred", JSON.stringify(cust));
  const usage1 = await waitFor(async () => (await get(tok, "ai_usage?select=outcome,model,input_tokens,tool_calls&order=created_at.desc"))[0]);
  ok("AI usage logged (outcome, tokens, tool calls)", usage1?.outcome === "replied" && usage1.input_tokens > 0 && usage1.tool_calls === 1, JSON.stringify(usage1));
  await page.goto(`${APP}/en/dashboard/conversations`);
  await main.getByRole("link", { name: /Chantal/ }).click();
  await main.getByText("La Robe Ankara coûte 15000 XAF.").waitFor({ timeout: 15000 });
  ok("AI reply shown in the conversation as WazaBolt AI", (await main.getByText("WazaBolt AI").count()) >= 1 && (await main.getByText("The assistant answers this customer automatically.").count()) === 1);
  await page.screenshot({ path: "test-results/stage3-ai-conversation.png", fullPage: true });

  // 2. A burst of two messages gets one answer — to the newest — and an order.
  const before = sentTexts().length;
  await deliver(text("Super"));
  await deliver(text("Je prends 2"));
  const orderReply = await waitFor(() => sentTexts().find((t) => t.includes("ORD-")));
  await sleep(2500);
  ok("burst of messages → one reply", sentTexts().length === before + 1, JSON.stringify(sentTexts().slice(before)));
  ok("assistant records the order and confirms it", orderReply === "C'est noté ! Votre commande ORD-00001 est enregistrée : 30000 XAF.", orderReply ?? "");
  const [order] = await get(tok, "orders?select=order_number,total,conversation_id,order_items(product_name,quantity,unit_price)");
  ok("order saved with catalog prices and linked to the conversation", order?.order_number === "ORD-00001" && Number(order.total) === 30000 && !!order.conversation_id && order.order_items[0].quantity === 2, JSON.stringify(order));

  // 3. Human Mode: the assistant stays silent.
  await page.reload();
  await main.getByRole("button", { name: "Take Over" }).click();
  await main.getByRole("button", { name: "Return to AI" }).waitFor({ timeout: 10000 });
  const beforeHuman = sentTexts().length;
  await deliver(text("C'est combien la robe ?"));
  await sleep(5000);
  ok("Human Mode: no AI reply", sentTexts().length === beforeHuman);
  await main.getByRole("button", { name: "Return to AI" }).click();
  await main.getByRole("button", { name: "Take Over" }).waitFor({ timeout: 10000 });

  // 4. Asking for a person: reply, then Human Mode + flagged for the team.
  await deliver(text("Je veux parler à quelqu'un"));
  await waitFor(() => sentTexts().includes("Bien sûr, je transmets votre demande à l'équipe."));
  const [conv] = await waitFor(async () => {
    const rows = await get(tok, "conversations?select=id,ai_enabled,human_requested,status&order=created_at.asc");
    return rows[0]?.ai_enabled === false ? rows : null;
  }) ?? [{}];
  ok("handover: Human Mode and flagged for the team", conv.ai_enabled === false && conv.human_requested === true && conv.status === "pending", JSON.stringify(conv));
  await patch(tok, `conversations?id=eq.${conv.id}`, { ai_enabled: true, human_requested: false, status: "open" });

  // 5. Voice note: fixed notice in the customer's language, team flagged.
  await deliver({ type: "audio", audio: { id: "media-voice", mime_type: "audio/ogg", voice: true } });
  const voice = await waitFor(() => sentTexts().find((t) => t.includes("messages vocaux") || t.includes("vocal")));
  ok("voice note → French notice and team flagged", !!voice, JSON.stringify(sentTexts().slice(-2)));

  // 6. After hours: the owner's message, sent once.
  await patch(tok, `businesses?id=eq.${biz.id}`, {
    opening_hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { closed: true, open: "08:00", close: "18:00" }])),
  });
  await patch(tok, `ai_settings?business_id=eq.${biz.id}`, { after_hours_mode: "after_hours_message", after_hours_message: "Nous sommes fermés. Nous vous répondrons demain matin." });
  await deliver(text("Vous êtes ouverts ?"), "237670000555", "Night Owl");
  const night = await waitFor(() => sentTexts().filter((t) => t.startsWith("Nous sommes fermés")).length === 1);
  await deliver(text("Allô ?"), "237670000555", "Night Owl");
  await sleep(5000);
  ok("after hours: the business's message, sent only once", !!night && sentTexts().filter((t) => t.startsWith("Nous sommes fermés")).length === 1);

  // 7. AI switched off: silence.
  await patch(tok, `ai_settings?business_id=eq.${biz.id}`, { ai_enabled: false, after_hours_mode: "reply_normally" });
  const beforeOff = sentTexts().length;
  await deliver(text("Bonjour ?"), "237670000777", "Quiet");
  await sleep(5000);
  ok("AI switched off: no reply", sentTexts().length === beforeOff);
  await page.goto(`${APP}/en/dashboard/ai`);
  ok("AI page shows Switched off and this month's activity", (await main.getByText("Switched off").count()) === 1 && (await main.getByText("AI replies").count()) === 1);
  await page.screenshot({ path: "test-results/stage3-ai-page.png", fullPage: true });

  // Leave the shared test number free for the other suites.
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByRole("button", { name: "Disconnect" }).click();
  await main.getByRole("button", { name: "Disconnect" }).last().click();
  await main.getByText("Not Connected").waitFor({ timeout: 15000 });

  ok("no browser errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  await ctx.close();
  await browser.close();
  graph.close();
  claude.close();
})().catch((e) => {
  console.log(results.join("\n"));
  console.error("CRASH", e.message);
  process.exit(1);
});
