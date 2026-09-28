/*
 * End-to-end auth test: sign-up → email confirmation → dashboard → logout →
 * login → password reset → tenant isolation. Runs against a real Supabase
 * Auth + database (never production) with Mailpit catching emails, e.g.
 * `npx supabase start` plus `npm run build && npm start`.
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run test:e2e
 *
 * Optional: APP_URL, MAILPIT_URL, NEXT_PUBLIC_SUPABASE_URL.
 */
import { chromium } from "playwright";
const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324"; // Supabase CLI default
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY");
const results = []; const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function latestMail(to, subjectIncludes) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json();
    const m = list.messages?.find((x) => x.Subject.includes(subjectIncludes));
    if (m) { const full = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json(); return full; }
    await sleep(500);
  }
  return null;
}
const linkFrom = (mail) => (mail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&");

import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });

(async () => {
  const stamp = Date.now();
  const A = { name: "Marie Jeanne Ngo", business: "MJ Fashion", email: `mj+${stamp}@example.com`, password: "Wazabolt2026" };
  const B = { name: "Paul Biya Tchoua", business: "Chez Paul", email: `paul+${stamp}@example.com`, password: "Ndole2026x" };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // 1. protected route
  await page.goto(`${APP}/dashboard/settings`);
  ok("unauthenticated /dashboard/settings redirects to login with next", page.url().includes("/login?next=%2Fdashboard%2Fsettings"), page.url());

  // 2. register validation + submit
  await page.goto(`${APP}/register`);
  await page.getByRole("button", { name: "Create account" }).click();
  ok("client validation shows field errors", (await page.getByText("Enter your name.").count()) === 1 && (await page.getByText("Use at least 8 characters.").count()) === 1);
  await page.getByLabel("Your name").fill(A.name);
  await page.getByLabel("Business name").fill(A.business);
  await page.getByLabel("Email", { exact: true }).fill(A.email);
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  ok("weak password rejected client-side", (await page.getByText("Use at least 8 characters.").count()) === 1);
  await page.getByLabel("Password", { exact: true }).fill(A.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 10000 });
  ok("sign-up shows check-your-email", true);
  await page.screenshot({ path: "test-results/e2e-register-done.png" });

  // 3. login before confirming
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email", { exact: true }).fill(A.email); await page.getByLabel("Password", { exact: true }).fill(A.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("Please confirm your email first").waitFor({ timeout: 10000 });
  ok("unconfirmed login blocked with clear message", true);

  // 4-5. confirmation email → dashboard
  const conf = await latestMail(A.email, "Confirm your WazaBolt account");
  ok("branded confirmation email received", !!conf && conf.HTML.includes("WazaBolt"), conf?.Subject);
  await page.goto(linkFrom(conf));
  await page.waitForURL(/\/dashboard/);
  ok("confirmation link signs in and lands on dashboard", page.url().includes("/dashboard?welcome=1"), page.url());
  ok("dashboard shows welcome + user name", (await page.getByText("Welcome, Marie").count()) === 1);
  ok("dashboard header shows business from DB", (await page.locator("header").getByText("MJ Fashion").count()) >= 1);
  const cookies = await ctx.cookies();
  const authCookies = cookies.filter((c) => c.name.startsWith("sb-"));
  ok("auth cookies are httpOnly + SameSite=Lax", authCookies.length > 0 && authCookies.every((c) => c.httpOnly && c.sameSite === "Lax"), authCookies.map((c) => c.name).join(","));
  await page.screenshot({ path: "test-results/e2e-dashboard.png", fullPage: true });

  // 6. guest-only redirect
  await page.goto(`${APP}/login`);
  ok("signed-in user visiting /login goes to dashboard", page.url().endsWith("/dashboard"), page.url());

  // reused confirmation link
  await page.goto(linkFrom(conf));
  ok("reused confirmation link is rejected", page.url().includes("error=link_invalid") || page.url().includes("/dashboard"), page.url());

  // 7. logout
  await page.goto(`${APP}/dashboard`);
  await page.locator("aside").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login\?message=signed_out/);
  ok("logout returns to login with message", (await page.getByText("You've been logged out.").count()) === 1);
  await page.goto(`${APP}/dashboard`);
  ok("dashboard protected again after logout", page.url().includes("/login"), page.url());

  // 8. wrong password
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email", { exact: true }).fill(A.email); await page.getByLabel("Password", { exact: true }).fill("WrongPass123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("That email and password don't match").waitFor({ timeout: 10000 });
  ok("wrong password shows safe error", true);

  // 9. login honours next; 11. open redirect blocked
  await page.goto(`${APP}/login?next=${encodeURIComponent("//evil.example")}`);
  await page.getByLabel("Email", { exact: true }).fill(A.email); await page.getByLabel("Password", { exact: true }).fill(A.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/localhost:3000\/dashboard/);
  ok("open redirect ?next=//evil.example ignored", page.url() === `${APP}/dashboard`, page.url());
  await page.goto(`${APP}/dashboard/settings`);
  ok("settings shows business defaults", (await page.getByText("Africa/Douala").count()) === 1 && (await page.getByText("XAF").count()) >= 1);
  await page.screenshot({ path: "test-results/e2e-settings.png", fullPage: true });
  await page.locator("aside").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto(`${APP}/login?next=/dashboard/settings`);
  await page.getByLabel("Email", { exact: true }).fill(A.email); await page.getByLabel("Password", { exact: true }).fill(A.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\/settings/);
  ok("login honours safe ?next=/dashboard/settings", true);
  await page.locator("aside").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login/);

  // 10. password reset
  await page.goto(`${APP}/forgot-password`);
  await page.getByLabel("Email", { exact: true }).fill(A.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("If an account exists for").waitFor({ timeout: 10000 });
  ok("forgot-password shows neutral confirmation", true);
  await page.goto(`${APP}/forgot-password`);
  await page.getByLabel("Email", { exact: true }).fill(`nobody+${stamp}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("If an account exists for").waitFor({ timeout: 10000 });
  ok("unknown email gets the same response (no enumeration)", true);
  const rec = await latestMail(A.email, "Reset your WazaBolt password");
  ok("branded recovery email received", !!rec, rec?.Subject);
  const recLink = linkFrom(rec);
  await page.goto(recLink);
  await page.waitForURL(/\/reset-password/);
  ok("recovery link lands on reset form", (await page.getByText("Choose a new password").count()) >= 1);
  await page.getByLabel("New password", { exact: true }).fill("NewPass2026");
  await page.getByLabel("Confirm new password").fill("Different2026");
  await page.getByRole("button", { name: "Save new password" }).click();
  ok("mismatched confirmation rejected", (await page.getByText("Passwords don't match.").count()) === 1);
  await page.getByLabel("Confirm new password").fill("NewPass2026");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByText("Your password has been updated.").waitFor({ timeout: 10000 });
  ok("password updated", true);
  await page.goto(`${APP}/dashboard`);
  await page.locator("aside").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto(recLink);
  ok("used recovery link cannot be replayed", page.url().includes("error=link_invalid"), page.url());
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email", { exact: true }).fill(A.email); await page.getByLabel("Password", { exact: true }).fill(A.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("That email and password don't match").waitFor({ timeout: 10000 });
  ok("old password no longer works", true);
  await page.getByLabel("Password", { exact: true }).fill("NewPass2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/);
  ok("new password works", true);

  // 12. second tenant
  const ctxB = await browser.newContext(); const pb = await ctxB.newPage();
  await pb.goto(`${APP}/register`);
  await pb.getByLabel("Your name").fill(B.name); await pb.getByLabel("Business name").fill(B.business);
  await pb.getByLabel("Email", { exact: true }).fill(B.email); await pb.getByLabel("Password", { exact: true }).fill(B.password);
  await pb.getByRole("button", { name: "Create account" }).click();
  await pb.getByText("Check your email").waitFor({ timeout: 10000 });
  await pb.goto(linkFrom(await latestMail(B.email, "Confirm your WazaBolt account")));
  await pb.waitForURL(/\/dashboard/);
  ok("tenant B sees only Chez Paul", (await pb.locator("header").getByText("Chez Paul").count()) >= 1 && (await pb.getByText("MJ Fashion").count()) === 0);
  // Direct API check with B's real access token.
  const tok = await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email: B.email, password: B.password }) })).json();
  const rows = await (await fetch(`${SUPABASE}/rest/v1/businesses?select=name`, { headers: { apikey: ANON, authorization: `Bearer ${tok.access_token}` } })).json();
  ok("REST API with B's token returns only B's business", Array.isArray(rows) && rows.length === 1 && rows[0].name === "Chez Paul", JSON.stringify(rows));
  const anonRows = await fetch(`${SUPABASE}/rest/v1/businesses?select=name`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
  ok("REST API with anon key is refused", anonRows.status === 401 || anonRows.status === 403, String(anonRows.status));

  ok("no browser console errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  await browser.close();
})().catch((e) => { console.log(results.join("\n")); console.error("CRASH", e.message); process.exit(1); });
