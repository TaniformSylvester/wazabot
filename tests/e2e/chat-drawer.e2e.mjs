/*
 * The conversation drawer on phones (< 768 px): opening a waiting thread from
 * the live queue opens a full-height drawer with the header on top and the
 * reply box at the bottom; 1-tap quick replies for the business type (sent at
 * once, or put in the box as a draft with a [gap] to fill); "Resolve & hand
 * back to AI" resolves, switches the assistant back on, records who did it
 * and closes the drawer. Desktop keeps its three-column page.
 *
 *   APP_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... node tests/e2e/chat-drawer.e2e.mjs
 * (the app pointed at the fake Graph API on :4010)
 */
import { execFileSync } from "node:child_process";

import { FAKE, startFakeGraph } from "./fake-graph.mjs";
import { chromium } from "./playwright.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.DATABASE_URL;
if (!ANON || !DB || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL");

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

(async () => {
  const graph = await startFakeGraph(4010);
  const stamp = Date.now();
  const O = { name: "Paul Tabi", business: `Chez Tabi ${stamp}`, email: `drawer-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const errors = [];
  try {
    // A restaurant owner signs up and connects WhatsApp (desktop).
    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    const page = await desk.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${APP}/en/register?vertical=restaurant`);
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
    const ownerId = sql(`select id from auth.users where email = '${O.email}'`);
    await page.goto(`${APP}/en/dashboard/whatsapp`);
    const main = page.locator("main");
    await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
    await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
    await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
    await main.getByRole("button", { name: "Connect WhatsApp" }).click();
    await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });

    // A customer is waiting for a person (wrote a minute ago: the 24-hour window is open).
    const cust = sql(`insert into customers (business_id, whatsapp_phone, name) values ('${biz}', '237670900111', 'Lina Mokake') returning id`).split("\n")[0];
    const conv = sql(`insert into conversations (business_id, customer_id, status, ai_enabled, human_requested, unread_count, language, last_message_at, last_customer_message_at) values ('${biz}', '${cust}', 'open', false, true, 1, 'en', now(), now()) returning id`).split("\n")[0];
    sql(`insert into messages (business_id, conversation_id, direction, sender_type, message_type, content, created_at) values ('${biz}', '${conv}', 'inbound', 'customer', 'text', 'Is my order ready?', now() - interval '1 minute')`);

    // ---------------------------------------------------------------- the drawer on a phone
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "en-US", storageState: await desk.storageState() });
    const pp = await phone.newPage();
    pp.on("pageerror", (e) => errors.push(String(e)));
    const vp = pp.viewportSize();
    await pp.goto(`${APP}/en/dashboard/conversations?filter=human`);
    await pp.locator("main").getByText("Lina Mokake").first().click();
    await pp.waitForURL(new RegExp(`/conversations/${conv}`), { timeout: 15000 });
    const drawer = pp.getByTestId("conversation-drawer");
    await drawer.waitFor({ timeout: 15000 });
    await sleep(400); // the slide-up
    const box = await drawer.boundingBox();
    ok("tapping a waiting thread opens a full-height drawer over the whole screen", !!box && Math.round(box.x) === 0 && Math.round(box.y) === 0 && Math.round(box.width) === vp.width && Math.abs(box.height - vp.height) <= 2, `${JSON.stringify(box)} vs ${vp.width}×${vp.height}`);
    const close = await pp.getByTestId("drawer-close").boundingBox();
    const resolveBtn = await pp.getByTestId("resolve-hand-back").boundingBox();
    ok("header: close and a prominent Resolve & hand back to AI button, at the top", !!close && !!resolveBtn && resolveBtn.y < 100 && close.y < 100 && (await pp.getByTestId("resolve-hand-back").innerText()).includes("Resolve & hand back to AI"));
    ok("…with an honest note while the AI assistant isn't live", /coming soon/.test(await pp.getByTestId("hand-back-note").innerText()));
    const input = await pp.locator("#composer-text").boundingBox();
    const chipsBox = await pp.getByTestId("quick-replies").boundingBox();
    ok("the reply box sits at the bottom (thumb zone), with the quick replies right above it", !!input && !!chipsBox && input.y + input.height <= vp.height && input.y > vp.height * 0.6 && chipsBox.y < input.y && chipsBox.y + chipsBox.height <= input.y + 4, `${JSON.stringify(chipsBox)} ${JSON.stringify(input)}`);
    const chips = await pp.getByTestId("quick-replies").getByRole("button").allInnerTexts();
    ok("restaurant: Order confirmed - preparing now, Order is ready for pickup, Out for delivery", chips.map((x) => x.replace(/\s*\(.*\)$/, "").trim()).join(" | ") === "Order confirmed - preparing now | Order is ready for pickup | Out for delivery", chips.join(" | "));
    ok("the chip strip scrolls sideways; the screen itself never does", (await pp.getByTestId("quick-replies").evaluate((e) => getComputedStyle(e).overflowX)) === "auto" && (await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
    ok("details (badges, mode, customer) fold behind More", (await pp.getByTestId("drawer-more").count()) === 1 && (await pp.getByRole("button", { name: "Take Over" }).count()) + (await pp.getByRole("button", { name: "Return to AI" }).count()) === 0);

    // A complete reply is sent at once.
    const before = graph.sent().sent.length;
    await pp.getByTestId("quick-replies").getByRole("button", { name: /Order is ready for pickup/ }).click();
    for (let i = 0; i < 40 && graph.sent().sent.length === before; i++) await sleep(250);
    const last = graph.sent().sent.at(-1);
    ok("tap: 'Order is ready for pickup' is sent on WhatsApp straight away", graph.sent().sent.length === before + 1 && last?.to === "237670900111" && last?.text?.body === "Your order is ready for pickup.", JSON.stringify(last));
    await sleep(800);
    ok("…recorded in the conversation, and the box is empty again", sql(`select content from messages where conversation_id = '${conv}' and direction = 'outbound' order by created_at desc limit 1`) === "Your order is ready for pickup." && (await pp.locator("#composer-text").inputValue()) === "");

    // ---------------------------------------------------------------- a shop: drafts with a gap, never sent on tap
    sql(`update businesses set industry = 'retail' where id = '${biz}'`);
    await pp.reload();
    await pp.getByTestId("quick-replies").waitFor({ timeout: 15000 });
    const shopChips = (await pp.getByTestId("quick-replies").getByRole("button").allInnerTexts()).map((x) => x.replace(/\s*\(.*\)$/, "").trim());
    ok("shop: Send payment details, Confirm item in stock, Share delivery ETA", shopChips.join(" | ") === "Send payment details | Confirm item in stock | Share delivery ETA", shopChips.join(" | "));
    const sentBefore = graph.sent().sent.length;
    await pp.getByTestId("quick-replies").getByRole("button", { name: /Share delivery ETA/ }).click();
    const draft = await pp.locator("#composer-text").evaluate((t) => ({ value: t.value, selected: t.value.slice(t.selectionStart, t.selectionEnd) }));
    await sleep(800);
    ok("tap: 'Share delivery ETA' puts a draft in the box with [time] selected to type over — nothing sent", draft.value === "Your order is on its way — it should arrive around [time]." && draft.selected === "[time]" && graph.sent().sent.length === sentBefore, JSON.stringify(draft));
    await pp.locator("#composer-text").fill("");

    // ---------------------------------------------------------------- a school: the fee schedule from its fee items
    sql(`update businesses set industry = 'school' where id = '${biz}'`);
    const year = sql(`insert into academic_years (business_id, name, is_current) values ('${biz}', '2026–2027', true) returning id`).split("\n")[0];
    sql(`insert into school_fee_items (business_id, year_id, name, amount) values ('${biz}', '${year}', 'Registration', 10000), ('${biz}', '${year}', 'Tuition', 50000)`);
    await pp.reload();
    await pp.getByTestId("quick-replies").waitFor({ timeout: 15000 });
    const schoolChips = (await pp.getByTestId("quick-replies").getByRole("button").allInnerTexts()).map((x) => x.replace(/\s*\(.*\)$/, "").trim());
    ok("school: Here is our fee schedule, Let's book a campus visit, Admissions team will call shortly", schoolChips.join(" | ") === "Here is our fee schedule | Let's book a campus visit | Admissions team will call shortly", schoolChips.join(" | "));
    await pp.getByTestId("quick-replies").getByRole("button", { name: /Here is our fee schedule/ }).click();
    const fees = await pp.locator("#composer-text").inputValue();
    ok("…the fee schedule is written from the school's own fees (a draft to check)", fees === "Here is our fee schedule for 2026–2027:\n• Registration: 10,000 FCFA\n• Tuition: 50,000 FCFA", JSON.stringify(fees));
    await pp.locator("#composer-text").fill("");
    sql(`update businesses set industry = 'restaurant' where id = '${biz}'`);

    // ---------------------------------------------------------------- resolve & hand back
    await pp.reload();
    await pp.getByTestId("resolve-hand-back").click();
    await pp.waitForURL((u) => u.pathname === "/en/dashboard/conversations", { timeout: 15000 });
    await sleep(500);
    ok("Resolve & hand back: the drawer closes, back on the list (its filter kept)", (await pp.getByTestId("conversation-drawer").count()) === 0 && new URL(pp.url()).searchParams.get("filter") === "human", pp.url());
    const resolved = sql(`select status || ' ' || ai_enabled || ' ' || human_requested || ' ' || (resolved_by = '${ownerId}') || ' ' || (resolved_at > now() - interval '1 minute') || ' ' || unread_count from conversations where id = '${conv}'`);
    ok(
      "…the thread is resolved, the assistant is back on, the request cleared — and who did it is recorded",
      resolved === "resolved true false true true 0" && sql(`select count(*) from audit_logs where action = 'conversation.resolved' and entity_id = '${conv}'`) === "1",
      resolved,
    );
    ok("…and it has left the queue", (await pp.locator("main").getByText("Lina Mokake").count()) === 0);

    // A viewer (read-only) can't resolve, even straight through the database.
    const viewer = await (
      await fetch(`${SUPABASE}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
        body: JSON.stringify({ email: `drawer-viewer+${stamp}@example.com`, password: "Wazabolt2026", email_confirm: true, user_metadata: { full_name: "Vic Viewer", setup: "later" } }),
      })
    ).json();
    sql(`insert into business_members (business_id, user_id, role) values ('${biz}', '${viewer.id}', 'viewer')`);
    sql(`update conversations set status = 'open', ai_enabled = false, human_requested = true where id = '${conv}'`);
    const vtok = (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email: `drawer-viewer+${stamp}@example.com`, password: "Wazabolt2026" }) })).json()).access_token;
    const vres = await fetch(`${SUPABASE}/rest/v1/rpc/resolve_and_hand_back`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${vtok}`, "content-type": "application/json" }, body: JSON.stringify({ p_conversation_id: conv }) });
    ok("a viewer can't resolve (the database refuses)", !vres.ok && sql(`select status from conversations where id = '${conv}'`) === "open", String(vres.status));

    // ---------------------------------------------------------------- desktop is unchanged
    await page.goto(`${APP}/en/dashboard/conversations/${conv}`);
    const deskDrawer = await page.getByTestId("conversation-drawer").boundingBox();
    ok("desktop: the usual page (list beside the conversation), no drawer close button", !!deskDrawer && deskDrawer.x > 100 && (await page.getByTestId("drawer-close").isVisible()) === false && (await page.getByRole("button", { name: /^(Take Over|Return to AI)$/ }).count()) === 1);
    await phone.close();
    await desk.close();

    ok("no page errors", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    await browser.close();
    graph.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
