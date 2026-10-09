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
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

import { startFakeAnthropic } from "./fake-anthropic.mjs";
import { startFakeResend } from "./fake-resend.mjs";
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
const DB = process.env.DATABASE_URL;
const RUN_STARTED = new Date().toISOString();
const sql = (q) => (DB ? execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim() : null);
const get = async (tok, path) => (await fetch(`${SUPABASE}/rest/v1/${path}`, { headers: restHeaders(tok) })).json();
const patch = (tok, path, body) => fetch(`${SUPABASE}/rest/v1/${path}`, { method: "PATCH", headers: restHeaders(tok), body: JSON.stringify(body) });
// products / order_items: cost columns are private, so ask for named columns, never *.
const returning = (path) => (/^(products|order_items)(\?|$)/.test(path) && !path.includes("select=") ? `${path}${path.includes("?") ? "&" : "?"}select=id,business_id,name,price,currency,stock_quantity,active` : path);
const post = (tok, path, body) => fetch(`${SUPABASE}/rest/v1/${returning(path)}`, { method: "POST", headers: restHeaders(tok, { prefer: "return=representation" }), body: JSON.stringify(body) });

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
  const resend = await startFakeResend(4030);
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
  const [dress] = await (await post(tok, "products", { business_id: biz.id, name: "Robe Ankara", category: "Robes", description: "Robe en wax rouge", price: 15000, stock_quantity: 5 })).json();
  // Catalog photo in the public product-images bucket (what the dashboard's upload does).
  const photoPath = `${biz.id}/${dress.id}/photo.jpg`;
  const redJpeg = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#c0392b" } }).jpeg().toBuffer();
  await fetch(`${SUPABASE}/storage/v1/object/product-images/${photoPath}`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${tok}`, "content-type": "image/jpeg" }, body: redJpeg });
  await patch(tok, `products?id=eq.${dress.id}`, { image_url: `${SUPABASE}/storage/v1/object/public/product-images/${photoPath}` });
  await post(tok, "faqs", { business_id: biz.id, question: "Livrez-vous à Buea ?", answer: "Oui, la livraison à Buea coûte 2 500 XAF." });

  // Test chat works without WhatsApp: real lookups, nothing sent or saved.
  await page.goto(`${APP}/en/dashboard/ai/test`);
  ok("test chat page shows the test-mode notice", (await main.getByText(/Test mode: nothing is sent on WhatsApp/).count()) === 1);
  const chatInput = main.getByLabel("Write as a customer would…");
  // A question with more to it than a price goes to Claude; a plain one is answered by the rules.
  await chatInput.fill("Bonjour, la robe Ankara c'est combien ? C'est pour un mariage.");
  await chatInput.press("Enter");
  await main.getByText("La Robe Ankara coûte 15000 XAF.").waitFor({ timeout: 20000 });
  ok("test chat: assistant answers from the catalog", (await main.getByText("Looked up: catalog").count()) === 1 && (await main.getByText("Reply language: French").count()) >= 1);
  const beforeRules = claude.requests.length;
  await chatInput.fill("Merci beaucoup");
  await chatInput.press("Enter");
  await main.getByText("Answered instantly from your business information (no AI used).").waitFor({ timeout: 20000 });
  ok("test chat: a plain thanks is answered by the rules, without Claude", claude.requests.length === beforeRules && (await main.getByText("Avec plaisir ! N'hésitez pas si vous avez une autre question.").count()) === 1);
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
  await chatInput.fill("FORCE_ERROR please");
  await chatInput.press("Enter");
  await main.getByText("The assistant couldn't answer. Please try again.").waitFor({ timeout: 20000 });
  ok("test chat: an API error shows a message, the page keeps working", (await main.getByText("We couldn't load this page").count()) === 0 && (await chatInput.inputValue()) === "FORCE_ERROR please");
  await main.getByRole("button", { name: "Start over" }).click();
  ok("test chat: start over clears the transcript", (await main.getByText("La Robe Ankara coûte 15000 XAF.").count()) === 0);

  // A customer photo in the test chat: shrunk in the browser, compared with the catalog photo.
  const customerPhoto = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: "#b03a2e" } }).png().toBuffer();
  await main.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: customerPhoto });
  await main.getByRole("button", { name: "Remove the photo" }).waitFor({ timeout: 10000 });
  await chatInput.fill("Vous avez ça ?");
  await chatInput.press("Enter");
  await main.getByText("Oui, nous avons cette Robe Ankara (même modèle que sur notre photo) : 15000 XAF.").waitFor({ timeout: 20000 });
  const photoReq = claude.requests.findLast((r) => r.body.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image")));
  const userImage = photoReq?.body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === "image");
  const imgMeta = userImage ? await sharp(Buffer.from(userImage.source.data, "base64")).metadata() : null;
  ok("test chat photo: sent to Claude as a JPEG of at most 1024 px", userImage?.source.media_type === "image/jpeg" && imgMeta && Math.max(imgMeta.width, imgMeta.height) <= 1024, JSON.stringify(imgMeta && { w: imgMeta.width, h: imgMeta.height }));
  const catalogImage = photoReq?.body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).flatMap((b) => (b.type === "tool_result" && Array.isArray(b.content) ? b.content : [])).find((c) => c.type === "image");
  const catMeta = catalogImage ? await sharp(Buffer.from(catalogImage.source.data, "base64")).metadata() : null;
  ok("catalog photos are sent as small thumbnails (512 px)", catMeta && Math.max(catMeta.width, catMeta.height) === 512, JSON.stringify(catMeta && { w: catMeta.width, h: catMeta.height }));
  const catalogPhoto = photoReq?.body.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result" && Array.isArray(b.content) && b.content.some((c) => c.type === "image")));
  ok("test chat photo: the catalog photo is shown to Claude for comparison", catalogPhoto && (await main.getByText("Looked up: catalog, product photos").count()) === 1);
  ok("test chat photo: shown in the transcript", (await main.getByRole("img", { name: "Photo sent by the customer" }).count()) === 1);
  await page.screenshot({ path: "test-results/stage5-test-chat-photo.png", fullPage: true });
  await main.getByRole("button", { name: "Start over" }).click();

  // Photos switched off (AI Assistant setting): passed to the team, no AI call.
  await page.goto(`${APP}/en/dashboard/ai`);
  await main.getByLabel("Understand customer photos").uncheck();
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("AI settings saved.").waitFor({ timeout: 10000 });
  await page.goto(`${APP}/en/dashboard/ai/test`);
  const requestsBefore = claude.requests.length;
  await main.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: customerPhoto });
  await main.getByRole("button", { name: "Remove the photo" }).waitFor({ timeout: 10000 });
  await main.getByRole("button", { name: "Send" }).click();
  await main.getByText("Thanks for the picture! I've passed it to the Awa Styles team", { exact: false }).waitFor({ timeout: 20000 });
  ok("photos off: passed to the team without calling Claude", claude.requests.length === requestsBefore);
  await page.goto(`${APP}/en/dashboard/ai`);
  await main.getByLabel("Understand customer photos").check();
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("AI settings saved.").waitFor({ timeout: 10000 });
  await page.goto(`${APP}/en/dashboard/ai/test`);

  // Before WhatsApp is connected the assistant isn't live.
  await page.goto(`${APP}/en/dashboard/ai`);
  await main.getByText("Waiting for WhatsApp").waitFor({ timeout: 10000 }).catch(() => {});
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
  const testChatRequests = claude.requests.length;
  ok("test chat runs on Haiku 4.5 (no effort, turn context in the customer's turn)", testChatRequests > 0 && claude.requests.slice(0, testChatRequests).every((r) => r.body.model === "claude-haiku-4-5" && !r.body.output_config && !r.body.messages.some((m) => m.role === "system")));
  await deliver(text("Bonjour, la robe Ankara c'est combien ? C'est pour un mariage."));
  const priceReply = await waitFor(() => sentTexts().find((t) => t.includes("15000")));
  ok("assistant answers a price question from the catalog", priceReply === "La Robe Ankara coûte 15000 XAF.", JSON.stringify(sentTexts()));
  const req = claude.requests[testChatRequests];
  ok("Claude request: Haiku 4.5, output capped for short replies, no effort or fallback", req?.body.model === "claude-haiku-4-5" && req.body.max_tokens === 300 && !req.body.output_config && !req.body.fallbacks);
  ok("price question: the matching product is prefetched into the turn, no search call", req.body.messages.at(-1).content.at(-1).text.includes("<catalog_matches>") && req.body.messages.at(-1).content.at(-1).text.includes("Robe Ankara") && claude.requests.length === testChatRequests + 1);
  ok("Claude request: cached system prompt with the FAQ, tools end with send_reply", req.body.system.every((b) => b.cache_control) && req.body.system[1].text.includes("Livrez-vous à Buea ?") && req.body.tools.at(-1).name === "send_reply");
  ok("Claude request: turn context closes the customer's turn (Haiku has no system messages)", req.body.messages.at(-1).role === "user" && req.body.messages.at(-1).content.at(-1).text.includes("reply_language: French (fr)"));
  if (DB) {
    // Our cost of each Claude request: one row per request, priced from config/economics.ts (fake usage: 1200 in, 60 out, 900 cache read).
    const rows = sql(`select source, model, step, cost_usd, cost_fcfa from claude_calls where created_at >= '${RUN_STARTED}' order by created_at, step`).split("\n").filter(Boolean).map((r) => r.split("|"));
    const replyRows = rows.filter((r) => r[0] === "reply");
    ok("every Claude request is logged with its cost (price question: one request, products prefetched)", replyRows.length === 1 && replyRows[0][1] === "claude-haiku-4-5" && Math.abs(Number(replyRows[0][3]) - 0.00159) < 1e-6 && Math.abs(Number(replyRows[0][4]) - 0.00159 * 570) < 1e-3, JSON.stringify(rows));
    ok("test-chat requests are logged too, at Haiku rates", rows.some((r) => r[0] === "test_chat" && r[1] === "claude-haiku-4-5" && Math.abs(Number(r[3]) - (1200 * 1 + 60 * 5 + 900 * 0.1) / 1e6) < 1e-6));
  }
  const costs = await fetch(`${SUPABASE}/rest/v1/claude_calls?select=id`, { headers: restHeaders(tok) });
  ok("owners can't read our Claude costs", costs.status >= 400);
  const aiMsgs = await get(tok, "messages?select=wa_category&sender_type=eq.ai");
  ok("assistant replies are recorded as service messages", aiMsgs.length > 0 && aiMsgs.every((m) => m.wa_category === "service"), JSON.stringify(aiMsgs));
  ok("the API key never reaches the browser", !(await page.content()).includes("test-key"));
  const [cust] = await get(tok, "customers?select=id,preferred_language,preferred_language_source");
  ok("customer's language remembered (inferred French)", cust.preferred_language === "fr" && cust.preferred_language_source === "inferred", JSON.stringify(cust));
  const usage1 = await waitFor(async () => (await get(tok, "ai_usage?select=outcome,model,input_tokens,tool_calls&order=created_at.desc"))[0]);
  ok("AI usage logged (outcome, tokens; no tool call needed for a prefetched product)", usage1?.outcome === "replied" && usage1.input_tokens > 0 && usage1.tool_calls === 0, JSON.stringify(usage1));
  await page.goto(`${APP}/en/dashboard/conversations`);
  await main.getByRole("link", { name: /Chantal/ }).click();
  await main.getByText("La Robe Ankara coûte 15000 XAF.").waitFor({ timeout: 15000 });
  ok("AI reply shown in the conversation as WazaBolt AI", (await main.getByText("WazaBolt AI").count()) >= 1 && (await main.getByText("The assistant answers this customer automatically.").count()) === 1);
  await page.screenshot({ path: "test-results/stage3-ai-conversation.png", fullPage: true });

  // 1b. Plain questions are answered by the rules layer from the business's data: no Claude call.
  const beforeRuled = { sent: sentTexts().length, claude: claude.requests.length };
  await deliver(text("c'est combien la robe ankara ?"), "237670000999", "Ndi");
  const ruledPrice = await waitFor(() => sentTexts().slice(beforeRuled.sent).find((t) => t.startsWith("Robe Ankara")));
  ok("rules: a plain price question is answered from the catalog without Claude", ruledPrice === "Robe Ankara : 15 000 FCFA." && claude.requests.length === beforeRuled.claude, String(ruledPrice));
  const ruledUsage = await waitFor(async () => (await get(tok, "ai_usage?select=model,reason&reason=eq.rules_price"))[0]);
  ok("rules: logged as a rules answer (no model cost)", ruledUsage?.model === "rules", JSON.stringify(ruledUsage));

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

  // 2b. A photo on WhatsApp (new customer): stored, then looked at and matched to the catalog.
  const beforePhoto = sentTexts().length;
  await deliver({ type: "image", image: { id: "media-1", mime_type: "image/jpeg", caption: "Vous avez ça ?" } }, "237670000777", "Joël");
  const photoReply = await waitFor(() => sentTexts().slice(beforePhoto).find((t) => t.startsWith("Oui, nous avons cette Robe Ankara")), 40000);
  ok("WhatsApp photo: the assistant recognises the product from the catalog", photoReply === "Oui, nous avons cette Robe Ankara (même modèle que sur notre photo) : 15000 XAF.", JSON.stringify(sentTexts().slice(beforePhoto)));
  const waPhotoReq = claude.requests.at(-1);
  ok("WhatsApp photo: Claude received the customer's photo with its caption", waPhotoReq?.body.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image") && m.content.some((b) => b.type === "text" && b.text.includes("[photo] Vous avez ça ?"))));

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

  // Emoji-only messages and repeats never reach Claude.
  await patch(tok, `ai_settings?business_id=eq.${biz.id}`, { ai_enabled: true });
  const beforeCheap = { sent: sentTexts().length, claude: claude.requests.length };
  await deliver(text("👍🏾🙏🏾"), "237670000888", "Emoji");
  await sleep(4500);
  ok("emoji-only message: no Claude call, no reply", sentTexts().length === beforeCheap.sent && claude.requests.length === beforeCheap.claude);
  await deliver(text("Bonjour, c'est combien la robe Ankara ?"), "237670000888", "Emoji");
  await waitFor(() => sentTexts().length > beforeCheap.sent);
  const afterFirst = { sent: sentTexts().length, claude: claude.requests.length };
  await deliver(text("Bonjour, c'est combien la robe Ankara ?"), "237670000888", "Emoji");
  await sleep(4500);
  ok("the same question again a minute later: not sent to Claude again", sentTexts().length === afterFirst.sent && claude.requests.length === afterFirst.claude);

  const summarised = claude.requests.find((r) => JSON.stringify(r.body.messages).includes("update_summary: yes"));
  const userTurns = summarised?.body.messages.filter((m) => m.role !== "system").length ?? 0;
  ok("only the last 6 messages are sent; once the window is full the assistant keeps a running summary", !!summarised && userTurns <= 6 && (await get(tok, "conversations?select=ai_summary&ai_summary=not.is.null")).some((c) => c.ai_summary.includes("Ankara")), String(userTurns));
  ok("a busy business gets the 1-hour prompt cache (3+ AI replies in the past hour)", claude.requests.some((r) => r.body.system?.[0]?.cache_control?.ttl === "1h") && claude.requests[testChatRequests].body.system[0].cache_control.ttl === undefined);

  // Step 4: 24-hour windows, the WazaBolt kill switch, the 10-reply cap and the hidden Claude budget.
  if (DB) {
    const convOf = (phone) => `(select c.id from conversations c join customers cu on cu.id = c.customer_id where cu.business_id = '${biz.id}' and cu.whatsapp_phone = '${phone}')`;
    ok("each Claude reply is counted in the customer's 24-hour window", Number(sql(`select coalesce(sum(claude_replies), 0) from ai_conversation_windows where business_id = '${biz.id}'`)) > 0);

    sql(`insert into platform_business_controls (business_id, ai_paused, reason) values ('${biz.id}', true, 'e2e')`);
    const beforePause = { sent: sentTexts().length, claude: claude.requests.length };
    await deliver(text("Bonjour, vous faites des robes de mariée sur mesure ?"), "237670001001", "Paused");
    await sleep(4500);
    ok(
      "kill switch: the assistant stays silent and the message waits for the team",
      sentTexts().length === beforePause.sent && claude.requests.length === beforePause.claude && sql(`select human_requested from conversations where id = ${convOf("237670001001")}`) === "t",
    );
    sql(`delete from platform_business_controls where business_id = '${biz.id}'`);

    await deliver(text("Je cherche une tenue pour un mariage samedi"), "237670001002", "Chatty");
    await waitFor(() => Number(sql(`select coalesce(sum(claude_replies), 0) from ai_conversation_windows where conversation_id = ${convOf("237670001002")}`)) > 0);
    sql(`update ai_conversation_windows set claude_replies = 10 where conversation_id = ${convOf("237670001002")}`);
    const beforeCap = { sent: sentTexts().length, claude: claude.requests.length };
    await deliver(text("Et pour la cérémonie religieuse, quelle tenue me conseillez-vous ?"), "237670001002", "Chatty");
    await waitFor(() => sentTexts().length > beforeCap.sent);
    ok(
      "after 10 Claude replies in a conversation it is handed to the team, with a notice",
      sentTexts().length === beforeCap.sent + 1 && claude.requests.length === beforeCap.claude && sql(`select ai_enabled from conversations where id = ${convOf("237670001002")}`) === "f",
    );

    // Free's hidden budget is 300 FCFA a month: bring the spend just under 80%, then past it.
    const spent = Number(sql(`select coalesce(sum(cost_fcfa), 0) from claude_calls where business_id = '${biz.id}' and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'`));
    sql(`insert into claude_calls (business_id, source, model, cost_usd, cost_fcfa) values ('${biz.id}', 'reply', 'e2e-budget', 0, ${Math.max(0, 239.99 - spent).toFixed(4)})`);
    await deliver(text("Vous pouvez coudre une robe pour ma fille de 6 ans ?"), "237670001003", "Budget");
    const alert = await waitFor(() => resend.emails.find((e) => e.subject.includes("of its Claude budget") && e.subject.includes(U.business)));
    ok("the WazaBolt team is emailed when a business passes 80% of its hidden budget", !!alert && alert.to.includes("contact@wazabolt.com"), alert?.subject ?? "");
    sql(`insert into claude_calls (business_id, source, model, cost_usd, cost_fcfa) values ('${biz.id}', 'reply', 'e2e-budget', 0, 100)`);
    const beforeBudget = { sent: sentTexts().length, claude: claude.requests.length };
    await deliver(text("Quels tissus me conseillez-vous pour une robe de soirée ?"), "237670001004", "Over");
    await sleep(4500);
    ok(
      "budget used up: no Claude; the question waits for the team",
      sentTexts().length === beforeBudget.sent && claude.requests.length === beforeBudget.claude && sql(`select human_requested from conversations where id = ${convOf("237670001004")}`) === "t",
    );
    await deliver(text("Bonjour"), "237670001005", "Hello");
    await waitFor(() => sentTexts().length > beforeBudget.sent);
    ok("budget used up: the rules still answer simple messages", sentTexts().length === beforeBudget.sent + 1 && claude.requests.length === beforeBudget.claude);
    sql(`delete from claude_calls where business_id = '${biz.id}' and model = 'e2e-budget'`);
  }

  // The owner's free-messages bar (counts only, no prices).
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByText("Free WhatsApp messages this month").waitFor({ timeout: 15000 });
  const freePanel = main.locator('section[aria-labelledby="free-whatsapp-messages-title"]');
  ok("WhatsApp page shows free messages left this month, without prices", /of 1,000 left/.test(await freePanel.innerText()) && !/\$|USD|FCFA|XAF/.test(await freePanel.innerText()), await freePanel.innerText());

  // The WazaBolt margin report: a 404 for everyone but platform admins.
  ok("margin report is a 404 for business owners", (await page.goto(`${APP}/en/admin/margins`))?.status() === 404);
  ok("businesses list is a 404 for business owners", (await page.goto(`${APP}/en/admin/businesses`))?.status() === 404);
  ok("pricing is a 404 for business owners", (await page.goto(`${APP}/en/admin/pricing`))?.status() === 404);
  await page.goto(`${APP}/en/dashboard/ai`);
  await main.waitFor({ timeout: 10000 });
  ok("business owners don't see the WazaBolt admin link", (await page.getByRole("link", { name: "WazaBolt admin" }).count()) === 0);
  if (DB) {
    const bizId = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${U.email}'`);
    sql(`insert into platform_admins (user_id) select id from auth.users where email = '${U.email}'`);
    await page.goto(`${APP}/en/admin/margins`);
    await page.getByRole("heading", { name: "By business" }).waitFor({ timeout: 15000 });
    const bizRow = page.locator(`tr[data-business-id="${bizId}"]`);
    const rowText = (await bizRow.count()) ? await bizRow.innerText() : "";
    ok("margin report: the business's plan, Claude cost and WhatsApp use", /free/i.test(rowText) && /FCFA/.test(rowText) && /test chat/.test(rowText), rowText);
    ok("margin report: Free counted as acquisition cost; Meta rates flagged unverified", (await page.locator('tr[data-plan="free"]').innerText()).includes("Acquisition cost") && (await page.getByText(/unverified/).count()) === 1);
    await page.screenshot({ path: "test-results/margins.png", fullPage: true });
    // Every sign-up, with its owner — reached from the dashboard link only platform admins see.
    await page.goto(`${APP}/en/dashboard/ai`);
    await page.getByRole("link", { name: "WazaBolt admin" }).first().click();
    await page.getByRole("heading", { name: "All sign-ups" }).waitFor({ timeout: 15000 });
    const signup = page.locator(`tr[data-business-id="${bizId}"]`);
    const signupText = (await signup.count()) ? await signup.innerText() : "";
    ok("platform admins reach the businesses list from the dashboard; each sign-up shows its owner, plan and WhatsApp", signupText.includes(U.email) && /free/i.test(signupText) && /Connected|Not connected/.test(signupText), signupText);
    await page.screenshot({ path: "test-results/admin-businesses.png", fullPage: true });
    // Step 5: simulated plan margins and the pricing calculator.
    await page.getByRole("link", { name: "Pricing" }).click();
    await page.getByRole("heading", { name: "Plans at full allowance" }).waitFor({ timeout: 90000 });
    const planRows = await page.locator("tr[data-plan]").allInnerTexts();
    ok("pricing: every plan simulated at full allowance, paid plans at or above the margin target", planRows.length === 5 && planRows.filter((r) => /^(boutique|starter|business|pro)/i.test(r)).every((r) => /Keep /.test(r)), planRows.join(" | "));
    await page.getByRole("heading", { name: /Simulation — 1,000 conversations/ }).waitFor({ timeout: 90000 });
    ok("pricing: the 1,000-conversation simulation report", (await page.getByText("Answered by rules").count()) >= 1 && (await page.getByText("Cache hit rate").count()) === 1);
    await page.getByLabel("Price (FCFA / month)").fill("5000");
    await page.getByLabel("AI conversations / month").fill("3000");
    await page.getByRole("button", { name: "Calculate" }).click();
    const calc = page.getByTestId("calculation");
    await calc.waitFor({ timeout: 90000 });
    ok("pricing calculator: a plan that loses margin is flagged with the lowest safe price", /Below target/.test(await calc.innerText()) && /charge at least/.test(await calc.innerText()), await calc.innerText());
    await page.screenshot({ path: "test-results/admin-pricing.png", fullPage: true });
    sql(`delete from platform_admins where user_id in (select id from auth.users where email = '${U.email}')`);
  }

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
  resend.close();
})().catch((e) => {
  console.log(results.join("\n"));
  console.error("CRASH", e.message);
  process.exit(1);
});
