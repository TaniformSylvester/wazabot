/*
 * End-to-end test: locale routing → sign-up → email confirmation → dashboard →
 * logout → login → password reset → languages & AI style settings →
 * French sign-up (French UI + email) → tenant isolation. Runs against a real Supabase
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && !m.location().url.includes("/no-such-page") && errors.push(m.text()));
  // Name the URL behind any "Failed to load resource" console error. The deliberate 404 test page is expected.
  page.on("response", (r) => r.status() === 404 && !r.url().includes("/no-such-page") && errors.push(`404 ${r.url()}`));
  const logout = async (p = page) => { await p.locator("aside").getByRole("button", { name: /Log out|Se déconnecter/ }).click(); await p.waitForURL(/\/login/); };
  const login = async (email, password, p = page) => {
    await p.getByLabel("Email", { exact: true }).fill(email); await p.getByLabel("Password", { exact: true }).fill(password);
    await p.getByRole("button", { name: "Log in" }).click();
  };

  // 0. locale routing
  await page.goto(`${APP}/pricing`);
  ok("unprefixed URL redirects to the browser language", page.url() === `${APP}/en/pricing`, page.url());
  ok("html lang is set per locale", (await page.getAttribute("html", "lang")) === "en");
  const alt = await page.locator('link[rel="alternate"][hreflang="fr"]').getAttribute("href");
  ok("hreflang alternates point to the French page", !!alt && alt.endsWith("/fr/pricing"), alt ?? "");
  const frProbe = await browser.newContext({ locale: "fr-FR" });
  const fp = await frProbe.newPage();
  await fp.goto(`${APP}/`);
  ok("French browser is sent to /fr", fp.url() === `${APP}/fr`, fp.url());
  ok("French home page is in French", (await fp.getByRole("heading", { level: 1 }).innerText()).includes("Boostez votre entreprise"));
  await fp.locator("header").getByRole("button", { name: "English" }).first().click();
  await fp.waitForURL(`${APP}/en`);
  await fp.getByRole("heading", { level: 1 }).filter({ hasText: "Power your business" }).waitFor();
  await fp.goto(`${APP}/faq`);
  ok("language choice is remembered (cookie beats Accept-Language)", fp.url() === `${APP}/en/faq`, fp.url());
  await frProbe.close();
  await page.goto(`${APP}/en/no-such-page`);
  ok("unknown localized path shows the localized 404", (await page.getByText("This page took a wrong turn").count()) === 1);
  await page.goto(`${APP}/industries`);
  ok("legacy redirect lands on the localized page", page.url() === `${APP}/en/solutions`, page.url());

  // 1. protected route
  await page.goto(`${APP}/en/dashboard/settings`);
  ok("unauthenticated dashboard redirects to login with next", page.url().includes("/en/login?next=%2Fen%2Fdashboard%2Fsettings"), page.url());

  // 2. register validation + submit
  await page.goto(`${APP}/en/register`);
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
  await page.goto(`${APP}/en/login`);
  await login(A.email, A.password);
  await page.getByText("Please confirm your email first").waitFor({ timeout: 10000 });
  ok("unconfirmed login blocked with clear message", true);

  // 4-5. confirmation email → dashboard
  const conf = await latestMail(A.email, "Confirm your WazaBolt account");
  ok("English confirmation email received", !!conf && conf.HTML.includes("Confirm my email") && linkFrom(conf).includes("next=/en/dashboard"), conf?.Subject);
  await page.goto(linkFrom(conf));
  await page.waitForURL(/\/dashboard/);
  ok("confirmation link signs in and lands on dashboard", page.url().includes("/en/dashboard?welcome=1"), page.url());
  ok("dashboard shows welcome + user name", (await page.getByText("Welcome, Marie").count()) === 1);
  ok("dashboard header shows business from DB", (await page.locator("header").getByText("MJ Fashion").count()) >= 1);
  const cookies = await ctx.cookies();
  const authCookies = cookies.filter((c) => c.name.startsWith("sb-"));
  ok("auth cookies are httpOnly + SameSite=Lax", authCookies.length > 0 && authCookies.every((c) => c.httpOnly && c.sameSite === "Lax"), authCookies.map((c) => c.name).join(","));
  await page.screenshot({ path: "test-results/e2e-dashboard.png", fullPage: true });

  // 6. guest-only redirect
  await page.goto(`${APP}/en/login`);
  ok("signed-in user visiting /login goes to dashboard", page.url().endsWith("/en/dashboard"), page.url());

  // reused confirmation link
  await page.goto(linkFrom(conf));
  ok("reused confirmation link is rejected", page.url().includes("error=link_invalid") || page.url().includes("/dashboard"), page.url());

  // 7. logout
  await page.goto(`${APP}/en/dashboard`);
  await page.locator("aside").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/en\/login\?message=signed_out/);
  ok("logout returns to login with message", (await page.getByText("You've been logged out.").count()) === 1);
  await page.goto(`${APP}/en/dashboard`);
  ok("dashboard protected again after logout", page.url().includes("/en/login"), page.url());

  // 8. wrong password
  await page.goto(`${APP}/en/login`);
  await login(A.email, "WrongPass123");
  await page.getByText("That email and password don't match").waitFor({ timeout: 10000 });
  ok("wrong password shows safe error", true);

  // 9. open redirect blocked
  await page.goto(`${APP}/en/login?next=${encodeURIComponent("//evil.example")}`);
  await login(A.email, A.password);
  await page.waitForURL(/localhost:3000\/en\/dashboard/);
  ok("open redirect ?next=//evil.example ignored", page.url() === `${APP}/en/dashboard`, page.url());
  await page.goto(`${APP}/en/dashboard/settings`);
  ok("settings shows business defaults", (await page.getByText("Africa/Douala").count()) === 1 && (await page.getByText("XAF").count()) >= 1);
  ok("settings shows the Cameroon language pack", (await page.getByText("English, French, Cameroonian Pidgin English").count()) === 1);
  await page.screenshot({ path: "test-results/e2e-settings.png", fullPage: true });

  // Languages & AI style (functional)
  await page.goto(`${APP}/en/dashboard/settings/languages`);
  const preview = page.locator("aside").filter({ hasText: "Try language detection" });
  await preview.getByRole("textbox").fill("Weti be di price for dis shoe?");
  ok("detection preview recognises Pidgin", (await preview.innerText()).includes("Would reply in\nCameroonian Pidgin English"), (await preview.innerText()).replace(/\n/g, " / "));
  await page.getByRole("checkbox", { name: /Cameroonian Pidgin English/ }).uncheck();
  ok("preview falls back to English when Pidgin is off", (await preview.innerText()).includes("isn't enabled, so the assistant uses English"));
  await page.getByText("Formal", { exact: true }).click();
  await page.getByText("Always use the default language").click();
  await page.getByLabel("Notes for your assistant").fill("Call customers Ma or Sir.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByText("Settings saved.").waitFor({ timeout: 10000 });
  await page.reload();
  ok("language settings persist after reload",
    !(await page.getByRole("checkbox", { name: /Cameroonian Pidgin English/ }).isChecked()) &&
    (await page.getByRole("radio", { name: /Always use the default language/ }).isChecked()) &&
    (await page.getByRole("radio", { name: "Formal", exact: true }).isChecked()) &&
    (await page.getByLabel("Notes for your assistant").inputValue()) === "Call customers Ma or Sir.");
  await page.screenshot({ path: "test-results/e2e-languages.png", fullPage: true });
  await page.getByRole("checkbox", { name: /^French/ }).uncheck();
  await page.getByRole("checkbox", { name: /^English/ }).uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  ok("at least one reply language is required", (await page.getByText("Choose at least one language.").count()) === 1);

  // Dashboard language is saved on the profile
  await page.goto(`${APP}/en/dashboard/settings`);
  await page.locator("main").getByRole("button", { name: "Français" }).click();
  await page.waitForURL(`${APP}/fr/dashboard/settings`);
  await page.getByRole("heading", { name: "Paramètres", level: 1 }).waitFor();
  ok("dashboard switches to French", (await page.getByRole("heading", { name: "Langue du tableau de bord" }).count()) === 1, await page.locator("main h2").allInnerTexts().then((t) => t.join(" | ")));
  const tokA = await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email: A.email, password: A.password }) })).json();
  const me = await (await fetch(`${SUPABASE}/rest/v1/users?select=ui_locale`, { headers: { apikey: ANON, authorization: `Bearer ${tokA.access_token}` } })).json();
  ok("ui_locale saved as fr", me?.[0]?.ui_locale === "fr", JSON.stringify(me));
  const settingsRows = await (await fetch(`${SUPABASE}/rest/v1/ai_settings?select=language_mode,formality,style_notes`, { headers: { apikey: ANON, authorization: `Bearer ${tokA.access_token}` } })).json();
  ok("ai_settings row saved through the API", settingsRows?.[0]?.language_mode === "fixed" && settingsRows?.[0]?.formality === "formal", JSON.stringify(settingsRows));
  await page.locator("main").getByRole("button", { name: "English" }).click();
  await page.waitForURL(`${APP}/en/dashboard/settings`);
  await logout();

  await page.goto(`${APP}/en/login?next=/en/dashboard/settings`);
  await login(A.email, A.password);
  await page.waitForURL(/\/en\/dashboard\/settings/);
  ok("login honours safe ?next=/en/dashboard/settings", true);
  await logout();

  // 10. password reset
  await page.goto(`${APP}/en/forgot-password`);
  await page.getByLabel("Email", { exact: true }).fill(A.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("If an account exists for").waitFor({ timeout: 10000 });
  ok("forgot-password shows neutral confirmation", true);
  await page.goto(`${APP}/en/forgot-password`);
  await page.getByLabel("Email", { exact: true }).fill(`nobody+${stamp}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("If an account exists for").waitFor({ timeout: 10000 });
  ok("unknown email gets the same response (no enumeration)", true);
  const rec = await latestMail(A.email, "Reset your WazaBolt password");
  ok("recovery email received", !!rec && linkFrom(rec).includes("next=/en/reset-password"), rec?.Subject);
  const recLink = linkFrom(rec);
  await page.goto(recLink);
  await page.waitForURL(/\/en\/reset-password/);
  ok("recovery link lands on reset form", (await page.getByText("Choose a new password").count()) >= 1);
  await page.getByLabel("New password", { exact: true }).fill("NewPass2026");
  await page.getByLabel("Confirm new password").fill("Different2026");
  await page.getByRole("button", { name: "Save new password" }).click();
  ok("mismatched confirmation rejected", (await page.getByText("Passwords don't match.").count()) === 1);
  await page.getByLabel("Confirm new password").fill("NewPass2026");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByText("Your password has been updated.").waitFor({ timeout: 10000 });
  ok("password updated", true);
  await page.goto(`${APP}/en/dashboard`);
  await logout();
  await page.goto(recLink);
  ok("used recovery link cannot be replayed", page.url().includes("error=link_invalid"), page.url());
  await page.goto(`${APP}/en/login`);
  await login(A.email, A.password);
  await page.getByText("That email and password don't match").waitFor({ timeout: 10000 });
  ok("old password no longer works", true);
  await page.getByLabel("Password", { exact: true }).fill("NewPass2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/en\/dashboard/);
  ok("new password works", true);

  // 12. second tenant, signing up in French
  const ctxB = await browser.newContext({ locale: "fr-FR" }); const pb = await ctxB.newPage();
  pb.on("pageerror", (e) => errors.push(String(e))); pb.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await pb.goto(`${APP}/register`);
  ok("French visitor gets the French sign-up page", pb.url() === `${APP}/fr/register`, pb.url());
  await pb.getByRole("button", { name: "Créer mon compte" }).click();
  ok("validation messages are in French", (await pb.getByText("Saisissez votre nom.").count()) === 1);
  await pb.getByLabel("Votre nom").fill(B.name); await pb.getByLabel("Nom de l'entreprise").fill(B.business);
  await pb.getByLabel("E-mail", { exact: true }).fill(B.email); await pb.getByLabel("Mot de passe", { exact: true }).fill(B.password);
  await pb.getByRole("button", { name: "Créer mon compte" }).click();
  await pb.getByText("Vérifiez votre boîte mail").waitFor({ timeout: 10000 });
  const confB = await latestMail(B.email, "Confirmez votre compte WazaBolt");
  ok("French confirmation email", !!confB && confB.HTML.includes("Confirmer mon e-mail") && confB.HTML.includes('lang="fr"') && linkFrom(confB).includes("next=/fr/dashboard"), confB?.Subject);
  await pb.goto(linkFrom(confB));
  await pb.waitForURL(/\/fr\/dashboard/);
  ok("French user lands on the French dashboard", (await pb.getByText("Bienvenue, Paul").count()) === 1, pb.url());
  ok("tenant B sees only Chez Paul", (await pb.locator("header").getByText("Chez Paul").count()) >= 1 && (await pb.getByText("MJ Fashion").count()) === 0);
  await pb.goto(`${APP}/fr/dashboard/settings`);
  ok("French sign-up sets French as the business default language", (await pb.getByText("Langue par défaut").locator("..").innerText()).includes("Français"));
  await pb.screenshot({ path: "test-results/e2e-fr-settings.png", fullPage: true });
  // Direct API checks with B's real access token.
  const tok = await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email: B.email, password: B.password }) })).json();
  const auth = { apikey: ANON, authorization: `Bearer ${tok.access_token}` };
  const rows = await (await fetch(`${SUPABASE}/rest/v1/businesses?select=name,default_language`, { headers: auth })).json();
  ok("REST API with B's token returns only B's business", Array.isArray(rows) && rows.length === 1 && rows[0].name === "Chez Paul" && rows[0].default_language === "fr", JSON.stringify(rows));
  const bSettings = await (await fetch(`${SUPABASE}/rest/v1/ai_settings?select=language_mode`, { headers: auth })).json();
  ok("B cannot see A's AI settings", Array.isArray(bSettings) && bSettings.length === 1 && bSettings[0].language_mode === "auto", JSON.stringify(bSettings));
  const rpc = await fetch(`${SUPABASE}/rest/v1/rpc/update_business_language_settings`, {
    method: "POST", headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ p_business_id: "00000000-0000-4000-a000-000000000000", p_default_language: "en", p_languages: ["en"], p_language_mode: "auto", p_tone: "friendly", p_formality: "neutral", p_emoji_level: "light", p_reply_length: "short", p_mirror_code_switching: false, p_style_notes: "" }),
  });
  ok("settings RPC refuses a business B does not own", rpc.status === 403 || rpc.status === 401, String(rpc.status));
  const anonRows = await fetch(`${SUPABASE}/rest/v1/businesses?select=name`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
  ok("REST API with anon key is refused", anonRows.status === 401 || anonRows.status === 403, String(anonRows.status));

  ok("no browser console errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  await browser.close();
})().catch((e) => { console.log(results.join("\n")); console.error("CRASH", e.message); process.exit(1); });
