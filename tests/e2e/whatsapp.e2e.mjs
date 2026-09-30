/*
 * End-to-end test of Stage 2 (WhatsApp Cloud API) against a local Supabase
 * stack and a local fake of Meta's Graph API (tests/e2e/fake-graph.mjs).
 * Never against production or the real Meta API.
 *
 * The app must be started with the same platform settings, e.g.:
 *   WHATSAPP_GRAPH_API_BASE_URL=http://localhost:4010 WHATSAPP_APP_SECRET=test-secret \
 *   WHATSAPP_VERIFY_TOKEN=test-verify WHATSAPP_TOKEN_ENCRYPTION_KEY=<32 bytes base64> \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service key> npm start
 * then:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... WHATSAPP_APP_SECRET=test-secret WHATSAPP_VERIFY_TOKEN=test-verify npm run test:e2e:whatsapp
 */
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { FAKE, startFakeGraph } from "./fake-graph.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.WHATSAPP_APP_SECRET;
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN;
if (!ANON || !SECRET || !VERIFY) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const token = async (email, password) =>
  (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password }) })).json()).access_token;
const rest = (tok) => ({ apikey: ANON, authorization: `Bearer ${tok}` });

/** Posts a webhook exactly as Meta does: raw JSON body + X-Hub-Signature-256. */
async function deliver(payload, secret = SECRET) {
  const body = JSON.stringify(payload);
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return fetch(`${APP}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body });
}
const envelope = (value, phoneNumberId = FAKE.phoneNumberId) => ({
  object: "whatsapp_business_account",
  entry: [{ id: FAKE.wabaId, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "237699000001", phone_number_id: phoneNumberId }, ...value } }] }],
});
const inbound = (from, name, message, phoneNumberId) =>
  envelope({ contacts: [{ wa_id: from, profile: { name } }], messages: [{ from, timestamp: String(Math.floor(Date.now() / 1000)), ...message }] }, phoneNumberId);
const statusUpdate = (wamid, status) => envelope({ statuses: [{ id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "237670000123" }] });

mkdirSync("test-results", { recursive: true });

async function signUp(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  await page.goto(`${APP}/en/register`);
  await page.getByLabel("Your name").fill(user.name);
  await page.getByLabel("Business name").fill(user.business);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 10000 });
  await page.goto(linkFrom(await latestMail(user.email, "Confirm")));
  await page.waitForURL(/\/dashboard\/onboarding/);
  return { ctx, page };
}

(async () => {
  const graph = await startFakeGraph(4010);
  const stamp = Date.now();
  const A = { name: "Awa Nkeng", business: "Awa Styles", email: `wa-a+${stamp}@example.com`, password: "Wazabolt2026" };
  const B = { name: "Ben Tabi", business: "Ben Shop", email: `wa-b+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const errors = [];
  const { ctx, page } = await signUp(browser, A);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const main = page.locator("main");

  // ------------------------------------------------------------- webhook guards
  const challenge = await fetch(`${APP}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=1158201444`);
  ok("webhook verification echoes the challenge", challenge.status === 200 && (await challenge.text()) === "1158201444");
  const badVerify = await fetch(`${APP}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`);
  ok("wrong verify token refused", badVerify.status === 403);
  const unsigned = await fetch(`${APP}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok("unsigned webhook refused", unsigned.status === 401);
  ok("webhook signed with another secret refused", (await deliver(inbound("237670000123", "X", { id: "wamid.bad", type: "text", text: { body: "x" } }), "other-secret")).status === 401);
  const early = await (await deliver(inbound("237670000123", "Chantal", { id: "wamid.early", type: "text", text: { body: "Hello?" } }))).json();
  ok("messages for a number not connected yet are not stored", early.stored === 0, JSON.stringify(early));

  // ------------------------------------------------------------------ connect
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  ok("WhatsApp page starts Not Connected with a connect form", (await main.getByText("Not Connected").count()) === 1 && (await main.getByLabel("Access token").count()) === 1);
  await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
  await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await main.getByLabel("Access token").fill("BAD-token-000000000000000");
  await main.getByRole("button", { name: "Connect WhatsApp" }).click();
  await main.getByText("Meta rejected the access token").waitFor({ timeout: 15000 });
  ok("invalid token → clear error, status Error", true);
  await main.getByLabel("Phone Number ID").fill(FAKE.otherPhoneNumberId);
  await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
  await main.getByRole("button", { name: "Connect WhatsApp" }).click();
  await main.getByText("doesn't belong to that WhatsApp Business Account").waitFor({ timeout: 15000 });
  ok("number outside the account refused", true);
  await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
  await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
  await main.getByRole("button", { name: "Connect WhatsApp" }).click();
  await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });
  ok("valid details → Connected with Meta's display number", (await main.getByText(FAKE.display).count()) === 1 && (await main.getByText(FAKE.verifiedName).count()) >= 1);
  ok("token shown only as a hint", (await main.getByText("ends in …1234").count()) === 1 && !(await page.content()).includes("GOOD-token-abcdefghijklmn1234"));
  await page.reload();
  ok("header shows WhatsApp connected", (await page.locator("header").getByText("WhatsApp connected").count()) === 1);
  const aTok = await token(A.email, A.password);
  const credRead = await fetch(`${SUPABASE}/rest/v1/whatsapp_credentials?select=*`, { headers: rest(aTok) });
  ok("owner's API token cannot read the stored credential", credRead.status === 401 || credRead.status === 403, String(credRead.status));
  await page.screenshot({ path: "test-results/stage2-whatsapp-connected.png", fullPage: true });

  // ------------------------------------------------------------------ inbound
  const first = inbound("237670000123", "Chantal", { id: "wamid.IN1", type: "text", text: { body: "Bonjour, vous livrez à Buea ?" } });
  const r1 = await (await deliver(first)).json();
  const r2 = await (await deliver(first)).json();
  ok("inbound text stored once; Meta retry is a duplicate", r1.stored === 1 && r2.stored === 0 && r2.duplicates === 1, JSON.stringify([r1, r2]));
  await page.goto(`${APP}/en/dashboard/conversations`);
  const convLink = main.getByRole("link", { name: /Chantal/ });
  ok("new conversation appears in the inbox with an unread badge", (await convLink.count()) === 1 && (await convLink.innerText()).includes("1"));
  await convLink.click();
  await main.getByText("Bonjour, vous livrez à Buea ?").waitFor({ timeout: 15000 });
  ok("customer message shown in the conversation", true);
  await sleep(1500);
  ok("opening the conversation sends a read receipt to WhatsApp", graph.sent().reads.includes("wamid.IN1"), JSON.stringify(graph.sent().reads));
  const [cust] = await (await fetch(`${SUPABASE}/rest/v1/customers?whatsapp_phone=eq.237670000123&select=name,first_contact_at,last_detected_language`, { headers: rest(aTok) })).json();
  ok("customer created from WhatsApp (name, first contact, detected language)", cust?.name === "Chantal" && !!cust.first_contact_at && cust.last_detected_language === "fr", JSON.stringify(cust));

  // -------------------------------------------------------------------- reply
  await main.getByLabel("Reply").fill("Oui ! La livraison à Buea coûte 2 500 XAF.");
  await main.getByRole("button", { name: "Send" }).click();
  await main.getByText("La livraison à Buea coûte 2 500 XAF.").waitFor({ timeout: 15000 });
  const sent = graph.sent().sent.at(-1);
  ok("reply sent through the Cloud API to the customer's number", sent?.to === "237670000123" && sent?.text?.body === "Oui ! La livraison à Buea coûte 2 500 XAF.", JSON.stringify(sent));
  ok("reply shows as Sent and the conversation is in Human Mode", (await main.getByText("Sent", { exact: true }).count()) >= 1 && (await main.getByText("Human Mode").count()) >= 1);
  ok("composer cleared after sending", (await main.getByLabel("Reply").inputValue()) === "");
  await deliver(statusUpdate(sent.wamid, "delivered"));
  await deliver(statusUpdate(sent.wamid, "read"));
  await deliver(statusUpdate(sent.wamid, "delivered")); // out of order: must not go back
  await page.reload();
  ok("delivery receipts: Read (never back to Delivered)", (await main.getByText("Read", { exact: true }).count()) === 1);

  // ---------------------------------------------------------------- media + auto refresh
  await deliver(inbound("237670000123", "Chantal", { id: "wamid.IN2", type: "image", image: { id: "media-1", mime_type: "image/jpeg", caption: "Celle-ci en taille L ?" } }));
  await main.getByText("Celle-ci en taille L ?").waitFor({ timeout: 20000 });
  ok("new message appears without reloading (auto refresh)", true);
  ok("image shows the not-processed note", (await main.getByText("Image — media processing will be available in a future release.").count()) === 1);
  await sleep(3000);
  const media = await (await fetch(`${SUPABASE}/rest/v1/message_media?select=status,kind,whatsapp_media_id`, { headers: rest(aTok) })).json();
  // The local test stack has no Storage service: the download works, storing is reported as failed.
  ok("media row recorded and processed after the response", media.length === 1 && media[0].kind === "image" && ["stored", "failed"].includes(media[0].status), JSON.stringify(media));
  await page.screenshot({ path: "test-results/stage2-conversation.png", fullPage: true });

  // ------------------------------------------------------------ send failures / 24h window
  await deliver(inbound("237699999999", "Blocked", { id: "wamid.IN3", type: "text", text: { body: "Hi" } }));
  await page.goto(`${APP}/en/dashboard/conversations`);
  await main.getByRole("link", { name: /Blocked/ }).click();
  await main.getByLabel("Reply").fill("Hello!");
  await main.getByRole("button", { name: "Send" }).click();
  await main.getByText("WhatsApp didn't accept the message").waitFor({ timeout: 15000 });
  ok("rejected send: clear error, message kept as Not delivered", (await main.getByText("Not delivered").count()) === 1);
  const old = inbound("237670000777", "Old Customer", { id: "wamid.IN4", type: "text", text: { body: "Merci" } });
  old.entry[0].changes[0].value.messages[0].timestamp = String(Math.floor(Date.now() / 1000) - 2 * 86400);
  await deliver(old);
  await page.goto(`${APP}/en/dashboard/conversations`);
  await main.getByRole("link", { name: /Old Customer/ }).click();
  await main.getByText("Merci", { exact: true }).waitFor({ timeout: 15000 });
  ok("after 24 hours the composer explains WhatsApp's rule instead of sending", (await main.getByText(/More than 24 hours since the customer's last message/).count()) === 1 && (await main.getByLabel("Reply").count()) === 0);

  // ----------------------------------------------------------- tenant isolation
  const { ctx: ctxB, page: pb } = await signUp(browser, B);
  await pb.goto(`${APP}/en/dashboard/conversations`);
  ok("business B sees none of A's WhatsApp conversations", (await pb.locator("main").getByText("No conversations yet").count()) === 1);
  await pb.goto(`${APP}/en/dashboard/whatsapp`);
  await pb.locator("main").getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
  await pb.locator("main").getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await pb.locator("main").getByLabel("Access token").fill("GOOD-token-bbbbbbbbbbbbbbbbbb");
  await pb.locator("main").getByRole("button", { name: "Connect WhatsApp" }).click();
  await pb.locator("main").getByText("already connected to another WazaBolt business").waitFor({ timeout: 15000 });
  ok("B cannot connect A's number", true);
  const bTok = await token(B.email, B.password);
  const bMsgs = await (await fetch(`${SUPABASE}/rest/v1/messages?select=id`, { headers: rest(bTok) })).json();
  ok("REST: B sees none of A's messages", Array.isArray(bMsgs) && bMsgs.length === 0);
  const rpc = await fetch(`${SUPABASE}/rest/v1/rpc/ingest_whatsapp_message`, {
    method: "POST",
    headers: { ...rest(bTok), "content-type": "application/json" },
    body: JSON.stringify({ p_phone_number_id: FAKE.phoneNumberId, p_whatsapp_message_id: "x", p_from: "237600000000", p_profile_name: "", p_message_type: "text", p_content: "x", p_caption: null, p_payload: {}, p_received_at: new Date().toISOString(), p_processing_status: "received" }),
  });
  ok("RPC: users cannot inject WhatsApp messages", rpc.status >= 400, String(rpc.status));
  await ctxB.close();

  // ---------------------------------------------------------------- disconnect
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByRole("button", { name: "Disconnect" }).click();
  await main.getByRole("button", { name: "Disconnect" }).last().click();
  await main.getByText("Not Connected").waitFor({ timeout: 15000 });
  ok("disconnect returns to Not Connected", true);
  const after = await (await deliver(inbound("237670000123", "Chantal", { id: "wamid.IN9", type: "text", text: { body: "Allô ?" } }))).json();
  ok("after disconnecting, messages for the number are no longer stored", after.stored === 0, JSON.stringify(after));
  await page.goto(`${APP}/fr/dashboard/whatsapp`);
  ok("French WhatsApp page", (await page.locator("main").getByRole("heading", { name: "Connecter votre numéro" }).count()) === 1);

  ok("no browser errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  await ctx.close();
  await browser.close();
  graph.close();
})().catch((e) => {
  console.log(results.join("\n"));
  console.error("CRASH", e.message);
  process.exit(1);
});
