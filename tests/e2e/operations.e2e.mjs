/*
 * End-to-end test of Stage 4 (business operations) against a local Supabase
 * stack: stock follows orders, stock alerts, the AI-allowance banner, plan
 * change requests, team invitations (new and existing accounts), roles,
 * removing members and switching between businesses.
 *
 * Needs direct database access (DATABASE_URL) to stand in for the WazaBolt
 * operator (approving a plan) and to simulate AI usage.
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... npm run test:e2e:operations
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { startFakeResend } from "./fake-resend.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB = process.env.DATABASE_URL;
if (!ANON || !DB) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY and DATABASE_URL");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(300)) {
    const v = await fn();
    if (v) return v;
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
const restHeaders = (tok, extra = {}) => ({ apikey: ANON, authorization: `Bearer ${tok}`, "content-type": "application/json", ...extra });
const get = async (tok, path) => (await fetch(`${SUPABASE}/rest/v1/${path}`, { headers: restHeaders(tok) })).json();
const post = async (tok, path, body) =>
  (await fetch(`${SUPABASE}/rest/v1/${path}`, { method: "POST", headers: restHeaders(tok, { prefer: "return=representation" }), body: JSON.stringify(body) })).json();
const token = async (email, password) =>
  (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password }) })).json()).access_token;

async function register(page, u) {
  await page.goto(`${APP}/en/register`);
  await page.getByLabel("Your name").fill(u.name);
  await page.getByLabel("Business name").fill(u.business);
  await page.getByLabel("Email", { exact: true }).fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 10000 });
  await page.goto(linkFrom(await latestMail(u.email, "Confirm")));
  await page.waitForURL(/\/dashboard\/onboarding/);
}

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const OWNER = { name: "Awa Nkeng", business: "Awa Styles", email: `ops-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const AGENT = { name: "Brice Tamo", email: `ops-agent+${stamp}@example.com`, password: "Wazabolt2026" };
  const OTHER = { name: "Clara Ebah", business: "Clara Beauty", email: `ops-other+${stamp}@example.com`, password: "Wazabolt2026" };
  const resend = await startFakeResend(4030);
  const emailTo = (to, subject) => resend.emails.find((e) => e.to.includes(to) && subject.test(e.subject));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const main = page.locator("main");

  await register(page, OWNER);
  const tok = await token(OWNER.email, OWNER.password);
  const [biz] = await get(tok, "businesses?select=id");
  sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${biz.id}'`);

  // ------------------------------------------------------------------ stock
  const [dress] = await post(tok, "products", { business_id: biz.id, name: "Robe Ankara", price: 15000, stock_quantity: 3, low_stock_threshold: 2 });
  const [customer] = await post(tok, "customers", { business_id: biz.id, whatsapp_phone: "237670000555", name: "Brenda" });
  await page.goto(`${APP}/en/dashboard/orders/new?customer=${customer.id}`);
  await main.getByRole("button", { name: "Add product" }).click();
  await main.getByLabel("Product", { exact: true }).selectOption({ label: "Robe Ankara — 15,000 FCFA" });
  await main.getByLabel("Qty").first().fill("4");
  await main.getByRole("button", { name: "New order" }).click();
  await main.getByText("Not enough stock for Robe Ankara.", { exact: false }).waitFor({ timeout: 10000 });
  ok("an order for more than the stock is refused, naming the product", (await get(tok, "orders?select=id")).length === 0);
  await main.getByLabel("Qty").first().fill("2");
  await main.getByRole("button", { name: "New order" }).click();
  await page.waitForURL(/\/dashboard\/orders\/[0-9a-f-]{36}\?saved=1/);
  const orderUrl = page.url().split("?")[0];
  const stockOf = async () => (await get(tok, `products?select=stock_quantity&id=eq.${dress.id}`))[0].stock_quantity;
  ok("placing an order takes it out of stock", (await stockOf()) === 1);

  await page.goto(`${APP}/en/dashboard`);
  await main.getByRole("heading", { name: "Stock alerts" }).waitFor({ timeout: 10000 });
  ok("dashboard: stock alert for a product at its low-stock threshold", (await main.getByRole("region", { name: "Stock alerts" }).getByText("1 left").count()) === 1);
  await page.screenshot({ path: "test-results/stage4-stock-alerts.png", fullPage: true });
  await page.goto(`${APP}/en/dashboard/products?stock=low`);
  ok("products: low-stock filter uses the product's own threshold", (await main.getByText("Robe Ankara").count()) === 1);

  await page.goto(orderUrl);
  await main.getByLabel("Order status").selectOption("cancelled");
  await main.getByRole("button", { name: "Save" }).click();
  await main.getByText("Order updated.").waitFor({ timeout: 10000 });
  ok("cancelling the order puts the stock back", (await stockOf()) === 3);
  await page.goto(`${APP}/en/dashboard`);
  ok("stock alert gone once restocked", (await main.getByRole("heading", { name: "Stock alerts" }).count()) === 0);

  // ------------------------------------------------------------ AI allowance
  sql(`insert into public.plans (id, name, monthly_price, ai_conversations_per_month, active, sort_order) values ('e2e_tiny_${stamp}', 'Tiny', 0, 5, false, 99)`);
  sql(`update public.subscriptions set plan_id = 'e2e_tiny_${stamp}' where business_id = '${biz.id}'`);
  const addAiConversations = (n) =>
    sql(`do $$ declare c uuid; begin for i in 1..${n} loop
      insert into public.conversations (business_id, customer_id) values ('${biz.id}', '${customer.id}') returning id into c;
      insert into public.messages (business_id, conversation_id, direction, sender_type, message_type, content, ai_generated)
      values ('${biz.id}', c, 'outbound', 'ai', 'text', 'Bonjour', true);
      insert into public.ai_conversation_windows (business_id, conversation_id, ends_at, claude_replies) values ('${biz.id}', c, now() + interval '24 hours', 1);
    end loop; end $$`);
  addAiConversations(4);
  await page.goto(`${APP}/en/dashboard/products`);
  ok("banner at 80% of the AI allowance", (await page.getByText("You've used 4 of the 5 AI conversations in your Tiny plan this month.").count()) === 1);
  addAiConversations(1);
  await page.reload();
  ok("banner when the allowance is used up", (await page.getByText(/Tiny plan's 5 AI conversations are used up/).count()) === 1);
  await page.screenshot({ path: "test-results/stage4-usage-banner.png" });

  // ------------------------------------------------------------ plan change
  await page.goto(`${APP}/en/dashboard/billing`);
  ok("billing: usage from the plan allowance", (await main.getByText("5 of 5").count()) === 1);
  await main.getByLabel("New plan").selectOption("business");
  await main.getByLabel("Phone or WhatsApp number to reach you").fill("+237 670 00 00 00");
  await main.getByRole("button", { name: "Send request" }).click();
  await main.getByText("Plan change requested").waitFor({ timeout: 10000 });
  ok("plan change request sent and shown as pending", (await main.getByText(/You asked for the Business plan/).count()) === 1);
  await page.screenshot({ path: "test-results/stage4-billing.png", fullPage: true });
  const requestId = sql(`select id from public.plan_change_requests where business_id = '${biz.id}' and status = 'pending'`);
  const teamEmail = await waitFor(() => emailTo("contact@wazabolt.com", /New plan request – Awa Styles → Business/));
  ok("the WazaBolt team is emailed about the new request (business, plan, phone)", !!teamEmail && teamEmail.html.includes("+237 670 00 00 00") && teamEmail.html.includes("25,000 FCFA") && teamEmail.html.includes("/en/admin/plan-requests"), teamEmail?.subject);

  // The WazaBolt team approves it in admin (this owner stands in for the team).
  sql(`insert into public.platform_admins (user_id) select id from auth.users where email = '${OWNER.email}'`);
  await page.goto(`${APP}/en/dashboard`);
  const adminLink = page.getByRole("link", { name: /WazaBolt admin/ }).first();
  await adminLink.waitFor({ timeout: 10000 });
  ok("the admin link shows how many plan requests are waiting", (await adminLink.innerText()).includes("1"));
  await adminLink.click();
  await page.getByRole("heading", { name: "Waiting for you (1)" }).waitFor({ timeout: 10000 });
  const card = page.locator(`li[data-request-id="${requestId}"]`);
  ok("plan requests page: business, plan and price, requester and phone", /Awa Styles/.test(await card.innerText()) && /Business/.test(await card.innerText()) && /25,000 FCFA/.test(await card.innerText()) && (await card.innerText()).includes(OWNER.email) && (await card.innerText()).includes("+237 670 00 00 00"));
  await page.screenshot({ path: "test-results/admin-plan-requests.png", fullPage: true });
  ok("the amount due is filled in", (await card.getByLabel("Amount received (FCFA)").inputValue()) === "25000");
  await card.getByLabel("Reference (optional)").fill("MP261004.1530.A12345");
  await card.getByRole("button", { name: "Approve" }).click();
  await page.getByText(/Approved — the payment is recorded/).waitFor({ timeout: 10000 });
  ok("approving records the payment", sql(`select amount::int || ' ' || method || ' ' || reference from public.subscription_payments where request_id = '${requestId}'`) === "25000 mobile_money MP261004.1530.A12345");
  ok("approved from admin: request recorded as approved", sql(`select status from public.plan_change_requests where id = '${requestId}'`) === "approved");
  const approvedEmail = await waitFor(() => emailTo(OWNER.email, /Your WazaBolt Business plan is active/));
  ok("the customer is emailed that the plan is active", !!approvedEmail && approvedEmail.from === "WazaBolt <noreply@wazabolt.com>" && approvedEmail.html.includes("/en/dashboard"));
  await page.goto(`${APP}/en/dashboard/billing`);
  ok("operator approval switches the plan and clears the banner", (await main.locator("li").filter({ hasText: "Business" }).getByText("Current plan").count()) === 1 && (await page.getByText(/AI conversations are used up/).count()) === 0);

  // Step 4: prepaid billing as the owner sees it.
  ok("billing: yearly price offered (pay 10 months, get 12)", (await main.getByText("or 250,000 FCFA/year: 2 months free").count()) === 1);
  ok("billing: paid until the end of the period", /Paid until/.test(await main.getByTestId("billing-state").innerText()));
  sql(`update public.subscriptions set current_period_end = now() + interval '3 days' where business_id = '${biz.id}'`);
  await page.reload();
  ok("renewal reminder in the last days of a paid period", /Your Business plan ends on .*Renew it/.test(await page.getByTestId("billing-banner").innerText()));
  sql(`update public.subscriptions set current_period_end = now() - interval '1 day', status = 'past_due' where business_id = '${biz.id}'`);
  await page.reload();
  ok("payment due: renew by the end of the grace days, or move to Free", /ended on .*Renew by .*Free plan/.test(await page.getByTestId("billing-banner").innerText()));
  ok("billing page: renewal is the default request", (await main.getByLabel("New plan").inputValue()) === "business" && (await main.getByRole("option", { name: "Business: renew" }).count()) === 1);
  await page.screenshot({ path: "test-results/step4-payment-due.png", fullPage: true });
  sql(`update public.subscriptions set current_period_end = now() + interval '1 month', status = 'active' where business_id = '${biz.id}'`);
  sql(`update public.subscriptions set rules_from = now() + interval '10 days' where business_id = '${biz.id}'`);
  await page.reload();
  ok("notice before the business moves to 24-hour AI conversations", /AI conversations are counted per customer per 24 hours/.test(await page.getByTestId("rules-notice").innerText()));
  sql(`update public.subscriptions set rules_from = now() where business_id = '${biz.id}'`);
  sql(`insert into public.platform_business_controls (business_id, ai_paused) values ('${biz.id}', true)`);
  await page.reload();
  ok("kill switch: the business is told its assistant is paused", (await page.getByText(/has paused your assistant/).count()) === 1);
  sql(`delete from public.platform_business_controls where business_id = '${biz.id}'`);

  // Declining a request emails the customer too, and leaves the plan as it is.
  await main.getByLabel("New plan").selectOption("starter");
  await main.getByRole("button", { name: "Send request" }).click();
  await main.getByText("Plan change requested").waitFor({ timeout: 10000 });
  const secondId = sql(`select id from public.plan_change_requests where business_id = '${biz.id}' and status = 'pending'`);
  await page.goto(`${APP}/en/admin/plan-requests`);
  await page.locator(`li[data-request-id="${secondId}"]`).getByRole("button", { name: "Decline" }).click();
  await page.getByText(/Declined — the customer has been emailed/).waitFor({ timeout: 10000 });
  const declinedEmail = await waitFor(() => emailTo(OWNER.email, /About your WazaBolt Starter plan request/));
  ok("declined from admin: plan unchanged, customer emailed, no requests waiting", !!declinedEmail && sql(`select plan_id from public.subscriptions where business_id = '${biz.id}'`) === "business" && (await page.getByRole("heading", { name: "Waiting for you (0)" }).count()) === 1);
  await page.goto(`${APP}/en/dashboard/billing`);
  ok("the owner sees the payment on Billing", /MP261004\.1530\.A12345/.test(await main.locator('section[aria-labelledby="payments-title"]').innerText()));

  // The kill switch, from the businesses list.
  await page.goto(`${APP}/en/admin/businesses`);
  const bizRow = page.locator(`tr[data-business-id="${biz.id}"]`);
  await bizRow.getByRole("button", { name: "Pause" }).click();
  await page.getByText(/Assistant paused/).waitFor({ timeout: 10000 });
  ok("kill switch: paused from WazaBolt admin", sql(`select ai_paused from public.platform_business_controls where business_id = '${biz.id}'`) === "t" && (await bizRow.getByText("Paused").count()) === 1);
  await bizRow.getByRole("button", { name: "Resume" }).click();
  await page.getByText(/Assistant switched back on/).waitFor({ timeout: 10000 });
  ok("kill switch: resumed", sql(`select ai_paused from public.platform_business_controls where business_id = '${biz.id}'`) === "f");
  sql(`delete from public.platform_admins where user_id in (select id from auth.users where email = '${OWNER.email}')`);

  // The daily billing job: renewal reminder, payment due, then Free after the grace days.
  const cron = () => fetch(`${APP}/api/cron/billing`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}` } }).then((r) => r.json());
  ok("billing job refuses calls without the cron secret", (await fetch(`${APP}/api/cron/billing`)).status === 401);
  sql(`update public.subscriptions set current_period_end = now() + interval '3 days' where business_id = '${biz.id}'`);
  await cron();
  const reminder = await waitFor(() => emailTo(OWNER.email, /Your WazaBolt Business plan ends on/));
  ok("renewal reminder emailed before the period ends (with the price)", !!reminder && reminder.html.includes("25,000 FCFA"), reminder?.subject);
  await cron();
  ok("each reminder is sent once", resend.emails.filter((e) => e.to.includes(OWNER.email) && /plan ends on/.test(e.subject)).length === 1);
  sql(`update public.subscriptions set current_period_end = now() - interval '1 day' where business_id = '${biz.id}'`);
  await cron();
  const due = await waitFor(() => emailTo(OWNER.email, /plan has ended: renew by/));
  ok("period ended: payment due, the owner is emailed", !!due && sql(`select status from public.subscriptions where business_id = '${biz.id}'`) === "past_due");
  sql(`update public.subscriptions set current_period_end = now() - interval '4 days' where business_id = '${biz.id}'`);
  await cron();
  const moved = await waitFor(() => emailTo(OWNER.email, /now on the WazaBolt Free plan/));
  ok("not renewed after the grace days: moved to Free, the owner is emailed", !!moved && sql(`select plan_id || ' ' || status from public.subscriptions where business_id = '${biz.id}'`) === "free active");

  // ---------------------------------------------------------------- invites
  await page.goto(`${APP}/en/dashboard/team`);
  await main.getByLabel("Their email address").fill(AGENT.email);
  await main.getByLabel("Role", { exact: true }).selectOption("agent");
  await main.getByRole("button", { name: "Create invitation link" }).click();
  const linkBox = main.getByRole("textbox", { name: `Invitation link for ${AGENT.email}` });
  await linkBox.waitFor({ timeout: 10000 });
  const agentLink = await linkBox.inputValue();
  ok("invitation link created with WhatsApp sharing", /\/en\/invite\/[A-Za-z0-9_-]{32}$/.test(agentLink) && (await main.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).startsWith("https://wa.me/?text="));
  ok("pending invitation listed", (await main.getByText("Pending invitations").count()) === 1);
  await page.screenshot({ path: "test-results/stage4-team-invite.png", fullPage: true });

  // A new person signs up from the link: joins this business, no business of their own.
  const actx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const ap = await actx.newPage();
  ap.on("pageerror", (e) => errors.push(String(e)));
  await ap.goto(agentLink);
  ok("invitation page names the business and role", (await ap.getByRole("heading", { name: "Join Awa Styles on WazaBolt" }).count()) === 1 && (await ap.getByText("Awa Nkeng invited you as Agent.").count()) === 1);
  await ap.getByLabel("Your name").fill(AGENT.name);
  await ap.getByLabel("Password", { exact: true }).fill(AGENT.password);
  await ap.getByRole("button", { name: "Create account and join" }).click();
  await ap.getByText(/open the confirmation email we sent you/).waitFor({ timeout: 10000 });
  await ap.goto(linkFrom(await latestMail(AGENT.email, "Confirm")));
  await ap.waitForURL(/\/dashboard/);
  await ap.getByText("Your email is confirmed — welcome to WazaBolt!").waitFor({ timeout: 10000 });
  ok("invited person lands in the inviting business's dashboard", (await ap.getByText("Awa Styles", { exact: true }).count()) >= 1);
  const agentTok = await token(AGENT.email, AGENT.password);
  const agentId = JSON.parse(Buffer.from(agentTok.split(".")[1], "base64url").toString()).sub;
  const agentBiz = await get(agentTok, `business_members?select=role,business_id&user_id=eq.${agentId}`);
  ok("invited sign-up joins the business as agent (no business of their own)", agentBiz.length === 1 && agentBiz[0].business_id === biz.id && agentBiz[0].role === "agent", JSON.stringify(agentBiz));
  await ap.goto(`${APP}/en/dashboard/team`);
  ok("agents can't invite", (await ap.getByLabel("Their email address").count()) === 0);
  await ap.goto(agentLink);
  ok("a used link can't be used again", (await ap.getByText("This invitation has been accepted.", { exact: false }).count()) === 1);

  // Roles: the owner makes the agent a viewer.
  await page.reload();
  await main.getByLabel(`Role of ${AGENT.name}`).selectOption("viewer");
  const agentRole = async () => (await get(agentTok, `business_members?select=role&user_id=eq.${agentId}`))[0]?.role;
  for (let i = 0; i < 20 && (await agentRole()) !== "viewer"; i++) await sleep(300);
  ok("owner changes a member's role", (await agentRole()) === "viewer");

  // An existing account (with its own business) accepts while signed in, then switches businesses.
  const octx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const op = await octx.newPage();
  op.on("pageerror", (e) => errors.push(String(e)));
  await register(op, OTHER);
  await page.goto(`${APP}/en/dashboard/team`);
  await main.getByLabel("Their email address").fill(OTHER.email);
  await main.getByLabel("Role", { exact: true }).selectOption("admin");
  await main.getByRole("button", { name: "Create invitation link" }).click();
  const otherBox = main.getByRole("textbox", { name: `Invitation link for ${OTHER.email}` });
  await otherBox.waitFor({ timeout: 10000 });
  const firstOtherLink = await otherBox.inputValue();
  await page.reload();
  await main.getByRole("button", { name: "New link" }).click();
  const renewed = main.getByRole("textbox", { name: `Invitation link for ${OTHER.email}` });
  await renewed.waitFor({ timeout: 10000 });
  const otherLink = await renewed.inputValue();
  await op.goto(firstOtherLink);
  ok("an old link stops working once a new one is made", (await op.getByText("This invitation link isn't valid.", { exact: false }).count()) === 1);

  // Wrong account: the agent opens the admin invitation meant for someone else.
  await ap.goto(otherLink);
  ok("an invitation for another email can't be accepted", (await ap.getByText(/but this invitation is for/).count()) === 1 && (await ap.getByRole("button", { name: /^Join/ }).count()) === 0);

  await op.goto(otherLink);
  await op.getByRole("button", { name: "Join Awa Styles" }).click();
  await op.waitForURL(/\/dashboard\?joined=1/);
  await op.getByText("You've joined Awa Styles.", { exact: false }).waitFor({ timeout: 10000 });
  const switcher = op.getByLabel("Switch business");
  ok("existing account joins as admin and gets a business switcher", (await switcher.count()) === 1 && (await op.getByText("Admin", { exact: true }).count()) >= 1);
  await switcher.selectOption({ label: "Clara Beauty" });
  await op.waitForURL((u) => u.pathname === "/en/dashboard/onboarding" || (u.pathname === "/en/dashboard" && !u.search.includes("joined")));
  await op.getByLabel("Switch business").waitFor();
  ok("switching back to their own business", (await op.getByLabel("Switch business").inputValue()) !== biz.id && (await op.getByText("Owner", { exact: true }).count()) >= 1);
  await op.screenshot({ path: "test-results/stage4-switcher.png" });

  // Removing a member: they lose access straight away.
  await page.goto(`${APP}/en/dashboard/team`);
  const agentRow = main.getByRole("row").filter({ hasText: AGENT.email });
  await agentRow.getByRole("button", { name: "Remove" }).click();
  await main.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  for (let i = 0; i < 20 && (await main.getByText(AGENT.email).count()) > 0; i++) await sleep(300);
  ok("owner removes a member", (await main.getByText(AGENT.email).count()) === 0);
  await ap.goto(`${APP}/en/dashboard`);
  await ap.waitForURL(/\/dashboard\/no-business/);
  ok("a removed member sees they're no longer in a business (no login loop)", (await ap.getByRole("heading", { name: "You're not part of a business" }).count()) === 1);

  // Team page on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/dashboard/team", "/dashboard/billing", "/dashboard"]) {
    await page.goto(`${APP}/en${p}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`no horizontal overflow at 390px on ${p}`, over <= 1, `+${over}px`);
  }
  await page.goto(`${APP}/fr/dashboard/team`);
  await main.getByRole("heading", { name: "Inviter un membre" }).waitFor({ timeout: 15000 }).catch(() => {});
  ok("team page in French", (await main.getByRole("heading", { name: "Inviter un membre" }).count()) === 1);

  ok("no browser errors", errors.length === 0, errors.join(" | "));
  sql(`update public.subscriptions set plan_id = 'free' where plan_id = 'e2e_tiny_${stamp}'; update public.plan_change_requests set from_plan_id = null where from_plan_id = 'e2e_tiny_${stamp}'; delete from public.plans where id = 'e2e_tiny_${stamp}'`);
  console.log(results.join("\n"));
  await browser.close();
  resend.close();
})().catch((e) => {
  console.error(e);
  console.log(results.join("\n"));
  process.exit(1);
});
