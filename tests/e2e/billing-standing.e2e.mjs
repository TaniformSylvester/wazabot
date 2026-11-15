/*
 * End-to-end test of billing standing and who sees billing: an unpaid plan
 * (the grace days after a paid period, or no plan) pauses broadcasts and new
 * invitations, in the app and in the database (WB421); team seats are
 * capped when an invitation is created (WB413); and only the owner sees
 * billing banners, upgrade links, the Billing page and plan requests.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... node tests/e2e/billing-standing.e2e.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "./playwright.mjs";

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
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim();
/** billing_standing() as the server calls it (service role). */
const standing = (id) => sql(`begin; set local request.jwt.claim.role = 'service_role'; select public.billing_standing('${id}'); commit;`);
/** The SQLSTATE a statement fails with, or "ok". */
const sqlError = (q) => {
  try {
    execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-qtAc", q], { encoding: "utf8", stdio: "pipe" });
    return "ok";
  } catch (e) {
    return (String(e.stderr).match(/ERROR:\s+([0-9A-Z]{5})/) || [])[1] ?? String(e.stderr);
  }
};
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

async function register(page, u) {
  await page.goto(`${APP}/en/register`);
  await page.getByLabel("Your name").fill(u.name);
  await page.getByLabel("Email", { exact: true }).fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 10000 });
  await page.goto(linkFrom(await latestMail(u.email, "Confirm")));
  await page.waitForURL(/\/dashboard\/setup/, { timeout: 15000 });
  await page.getByLabel("Business name").fill(u.business);
  await page.getByTestId("setup-type").getByText("Shop", { exact: true }).click();
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 15000 });
}

mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const OWNER = { name: "Grace Ewane", business: "Ewane Market", email: `bs-owner+${stamp}@example.com`, password: "Wazabolt2026" };
  const MANAGER = { name: "Eric Tabi", email: `bs-manager+${stamp}@example.com`, password: "Wazabolt2026" };
  const AGENT = { name: "Lina Fon", email: `bs-agent+${stamp}@example.com`, password: "Wazabolt2026" };
  const browser = await chromium.launch();
  const errors = [];
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    return p;
  };
  const page = await open();
  const main = page.locator("main");

  /** The owner creates an invitation link; the person signs up from it and confirms their email. */
  async function join(u, role) {
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(u.email);
    await main.getByLabel("Role", { exact: true }).selectOption(role);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    const box = main.getByRole("textbox", { name: `Invitation link for ${u.email}` });
    await box.waitFor({ timeout: 10000 });
    const link = await box.inputValue();
    const p = await open();
    await p.goto(link);
    await p.getByLabel("Your name").fill(u.name);
    await p.getByLabel("Password", { exact: true }).fill(u.password);
    await p.getByRole("button", { name: "Create account and join" }).click();
    await p.getByText(/We sent a confirmation link to/).waitFor({ timeout: 10000 });
    await p.goto(linkFrom(await latestMail(u.email, "Confirm")));
    await p.waitForURL(/\/dashboard/, { timeout: 15000 });
    return p;
  }
  const navHasBilling = async (p) => (await p.getByRole("link", { name: "Billing", exact: true }).count()) > 0;
  const tokenFor = async (u) =>
    (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email: u.email, password: u.password }) })).json()).access_token;
  const rpc = async (token, fn, args) => {
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` }, body: JSON.stringify(args) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  try {
    await register(page, OWNER);
    const bizId = sql(`select m.business_id from business_members m join auth.users u on u.id = m.user_id where u.email = '${OWNER.email}'`);
    sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now() where id = '${bizId}'`);
    // Multi-shop (10 users) so seats don't get in the way until the seat test.
    sql(`update subscriptions set plan_id = 'multishop' where business_id = '${bizId}'`);
    ok("a new business is on its trial (billing_standing = trialing)", standing(bizId) === "trialing");

    const mp = await join(MANAGER, "admin");
    const ap = await join(AGENT, "agent");
    ok("a manager and a staff member joined", sql(`select string_agg(role::text, ',' order by role::text) from business_members where business_id = '${bizId}'`) === "admin,agent,owner");

    // ---------------------------------------------------------------- who sees billing (trial)
    await page.goto(`${APP}/en/dashboard`);
    await mp.goto(`${APP}/en/dashboard`);
    await ap.goto(`${APP}/en/dashboard`);
    ok("trial: the owner sees the trial banner and Billing in the menu", (await page.getByTestId("trial-banner").count()) === 1 && (await navHasBilling(page)));
    ok("trial: the manager sees no trial banner and no Billing", (await mp.getByTestId("trial-banner").count()) === 0 && !(await navHasBilling(mp)));
    ok("trial: staff see no trial banner and no Billing", (await ap.getByTestId("trial-banner").count()) === 0 && !(await navHasBilling(ap)));
    // The owner can hide the trial banner for a day (not in the last 3 days); Settings links to Billing for the owner only.
    sql(`update subscriptions set current_period_end = now() + interval '10 days' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard`);
    await page.getByTestId("trial-banner").getByRole("button", { name: "Hide" }).click();
    await page.getByTestId("trial-banner").waitFor({ state: "detached", timeout: 10000 });
    await page.reload();
    ok("trial: the owner can hide the banner, and it stays hidden", (await page.getByTestId("trial-banner").count()) === 0);
    sql(`update subscriptions set current_period_end = now() + interval '2 days' where business_id = '${bizId}'`);
    await page.reload();
    ok("trial, last days: the banner is back and can't be hidden", (await page.getByTestId("trial-banner").count()) === 1 && (await page.getByTestId("trial-banner").getByRole("button", { name: "Hide" }).count()) === 0);
    sql(`update subscriptions set current_period_end = now() + interval '14 days' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard/settings`);
    await mp.goto(`${APP}/en/dashboard/settings`);
    ok("Settings: Plan and billing for the owner only", (await page.getByTestId("settings-billing").count()) === 1 && (await mp.getByTestId("settings-billing").count()) === 0);
    await page.goto(`${APP}/en/dashboard/settings/billing`);
    ok("/dashboard/settings/billing opens the Billing page for the owner", /\/en\/dashboard\/billing/.test(page.url()) && (await page.getByTestId("plan-usage").count()) === 1 && (await page.getByTestId("ai-panel").count()) === 1);
    await mp.goto(`${APP}/en/dashboard/settings/billing`);
    await mp.waitForURL(/\/en\/dashboard(\?|$)/, { timeout: 10000 }).catch(() => {});
    ok("…and sends the manager back to the dashboard", !/\/dashboard\/(settings\/)?billing/.test(mp.url()), mp.url());

    await mp.goto(`${APP}/en/dashboard/billing`);
    ok("the manager is sent away from the Billing page", !/\/dashboard\/billing/.test(mp.url()) && (await mp.getByTestId("plan-card-business").count()) === 0, mp.url());

    // ---------------------------------------------------------------- upgrade prompts: a link for the owner only
    sql(`update subscriptions set plan_id = 'boutique', status = 'active', current_period_end = now() + interval '1 month' where business_id = '${bizId}'`);
    await page.goto(`${APP}/en/dashboard/expenses`);
    await mp.goto(`${APP}/en/dashboard/expenses`);
    const ownerUpsell = page.locator("main").getByTestId("plan-upsell");
    const managerUpsell = mp.locator("main").getByTestId("plan-upsell");
    ok("Boutique: the owner's upgrade prompt links to Billing", (await ownerUpsell.getByRole("link").count()) === 1);
    ok(
      "Boutique: the manager's has no link and no price, only that the owner can change the plan",
      (await managerUpsell.count()) === 1 && (await managerUpsell.getByRole("link").count()) === 0 && (await managerUpsell.getByTestId("plan-ask-owner").count()) === 1 && !/FCFA/.test(await managerUpsell.innerText()),
      await managerUpsell.innerText().catch(() => ""),
    );

    // ---------------------------------------------------------------- the seat cap at invitation time
    sql(`update subscriptions set plan_id = 'business' where business_id = '${bizId}'`); // 3 users: full
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`bs-fourth+${stamp}@example.com`);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByTestId("upgrade-prompt").waitFor({ timeout: 10000 });
    ok("Business (3 users, full): a fourth is refused when the invitation is created (WB413)", sql(`select count(*) from business_invitations where business_id = '${bizId}' and email like 'bs-fourth%'`) === "0" && /no more users/.test(await main.getByTestId("upgrade-prompt").innerText()));
    ok("…and the database refuses it too", sqlError(`insert into business_invitations (business_id, email, role, token_hash) values ('${bizId}', 'bs-direct+${stamp}@example.com', 'agent', md5('a${stamp}') || md5('b${stamp}'))`) === "WB413");

    // ---------------------------------------------------------------- payment due (grace days)
    sql(`update subscriptions set plan_id = 'multishop', status = 'past_due', current_period_end = now() - interval '1 day' where business_id = '${bizId}'`);
    ok("payment due: billing_standing = past_due", standing(bizId) === "past_due");
    await page.goto(`${APP}/en/dashboard`);
    await mp.goto(`${APP}/en/dashboard`);
    await ap.goto(`${APP}/en/dashboard`);
    ok("payment due: the owner sees the payment banner", (await page.getByTestId("billing-banner").count()) === 1);
    ok("payment due: the manager and staff don't", (await mp.getByTestId("billing-banner").count()) === 0 && (await ap.getByTestId("billing-banner").count()) === 0);

    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`bs-late+${stamp}@example.com`);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByTestId("upgrade-prompt").waitFor({ timeout: 10000 });
    ok(
      "payment due: a new invitation is refused, with a link to Billing for the owner",
      sql(`select count(*) from business_invitations where business_id = '${bizId}' and email like 'bs-late%'`) === "0" && /broadcasts and new invitations are paused/.test(await main.getByTestId("upgrade-prompt").innerText()) && (await main.getByTestId("upgrade-prompt").getByRole("link", { name: /See plans/ }).count()) === 1,
    );
    ok("…and the database refuses it too (WB421)", sqlError(`insert into business_invitations (business_id, email, role, token_hash) values ('${bizId}', 'bs-direct2+${stamp}@example.com', 'agent', md5('c${stamp}') || md5('d${stamp}'))`) === "WB421");

    const bcId = sql(`insert into broadcasts (business_id, name, language, body, template_name, template_status) values ('${bizId}', 'Promo', 'en', 'Big sale this week', 'promo_${stamp}', 'approved') returning id`);
    await mp.goto(`${APP}/en/dashboard/broadcasts/${bcId}`);
    await mp.getByRole("button", { name: /^Send to/ }).click();
    await mp.locator("main").getByTestId("upgrade-prompt").waitFor({ timeout: 10000 });
    const mPrompt = mp.locator("main").getByTestId("upgrade-prompt");
    ok("payment due: the manager can't send a broadcast; told why, with no Billing link", sql(`select status from broadcasts where id = '${bcId}'`) === "draft" && /broadcasts and new invitations are paused/.test(await mPrompt.innerText()) && (await mPrompt.getByRole("link").count()) === 0 && (await mPrompt.getByTestId("upgrade-ask-owner").count()) === 1);
    ok("…and the database refuses to start it (WB421)", sqlError(`select public.prepare_broadcast('${bcId}')`) === "WB421" && sql(`select status from broadcasts where id = '${bcId}'`) === "draft");
    ok("payment due: everything else keeps working (a product can still be added)", sqlError(`insert into products (business_id, name, price, stock_quantity) values ('${bizId}', 'Pagne wax', 8000, 3)`) === "ok");

    // ---------------------------------------------------------------- plan requests: the owner's only
    const managerToken = await tokenFor(MANAGER);
    const req = await rpc(managerToken, "request_plan_change", { p_business_id: bizId, p_plan_id: "business", p_contact_phone: null, p_note: null, p_interval: "month", p_addon_id: null, p_accept_meta_notice: false });
    ok("a manager can't ask for a plan change, even calling the database directly", req.status >= 400 && sql(`select count(*) from plan_change_requests where business_id = '${bizId}'`) === "0", JSON.stringify(req.body)?.slice(0, 160));

    // ---------------------------------------------------------------- renewed: everything back
    sql(`update subscriptions set status = 'active', current_period_end = now() + interval '1 month' where business_id = '${bizId}'`);
    ok("renewed: billing_standing = active", standing(bizId) === "active");
    await page.goto(`${APP}/en/dashboard/team`);
    await main.getByLabel("Their email address").fill(`bs-later+${stamp}@example.com`);
    await main.getByRole("button", { name: "Create invitation link" }).click();
    await main.getByRole("textbox", { name: `Invitation link for bs-later+${stamp}@example.com` }).waitFor({ timeout: 10000 });
    ok("renewed: invitations work again", sql(`select count(*) from business_invitations where business_id = '${bizId}' and email like 'bs-later%'`) === "1");
    ok("renewed: a broadcast can start again", sqlError(`select public.prepare_broadcast('${bcId}')`) === "ok" && sql(`select status from broadcasts where id = '${bcId}'`) === "sending");

    // ---------------------------------------------------------------- no plan (expired)
    sql(`update subscriptions set plan_id = 'free', status = 'active' where business_id = '${bizId}'`);
    ok("no plan: billing_standing = expired", standing(bizId) === "expired");
    ok("no plan: invitations refused by the database (WB421)", sqlError(`insert into business_invitations (business_id, email, role, token_hash) values ('${bizId}', 'bs-direct3+${stamp}@example.com', 'agent', md5('e${stamp}') || md5('f${stamp}'))`) === "WB421");
    await page.goto(`${APP}/en/dashboard`);
    await mp.goto(`${APP}/en/dashboard`);
    const ownerRO = page.getByTestId("read-only-banner");
    const managerRO = mp.getByTestId("read-only-banner");
    ok("no plan: the owner's banner offers to choose a plan", (await ownerRO.getByRole("link", { name: /Choose a plan/ }).count()) === 1);
    ok("no plan: the manager is told the owner will choose one (no link)", (await managerRO.count()) === 1 && (await managerRO.getByRole("link").count()) === 0 && /until the owner chooses a plan/.test(await managerRO.innerText()));
    await mp.goto(`${APP}/en/dashboard/sales/new`);
    const mSale = mp.locator("main").getByTestId("plan-upsell");
    ok("no plan: the manager's sales page has no Billing link", (await mSale.count()) === 1 && (await mSale.getByRole("link").count()) === 0 && /until the owner chooses a plan/.test(await mSale.innerText()));
    await mp.screenshot({ path: "test-results/billing-standing-manager.png", fullPage: true });
  } catch (e) {
    results.push(`CRASH ${e?.stack ?? e}`);
    process.exitCode = 1;
  } finally {
    ok("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
    await browser.close();
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
