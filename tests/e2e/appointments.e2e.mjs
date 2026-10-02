/*
 * End-to-end test of Stage 6 (appointments) against a local Supabase stack,
 * the fake Graph API (port 4010) and the scripted fake Anthropic API (port 4020):
 * booking settings, services, booking from the dashboard (only free times,
 * no double booking), status changes, the assistant booking in the test chat
 * (simulated) and on WhatsApp (saved).
 *
 * Start the app as for the AI suite, then:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=... WHATSAPP_APP_SECRET=... npm run test:e2e:appointments
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { startFakeAnthropic } from "./fake-anthropic.mjs";
import { FAKE, startFakeGraph } from "./fake-graph.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://localhost:54324";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB = process.env.DATABASE_URL;
const SECRET = process.env.WHATSAPP_APP_SECRET;
if (!ANON || !DB || !SECRET) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL and WHATSAPP_APP_SECRET");

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
const post = async (tok, path, body) => (await fetch(`${SUPABASE}/rest/v1/${path}`, { method: "POST", headers: restHeaders(tok), body: JSON.stringify(body) })).json();
// Tomorrow's date in Douala (the business's timezone).
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86_400_000));

async function deliver(text, from = "237670000888", name = "Mireille") {
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
              messages: [{ from, id: `wamid.AP${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
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
  const claude = await startFakeAnthropic(4020);
  const stamp = Date.now();
  const U = { name: "Grace Mbah", business: "Salon Grace", email: `appt+${stamp}@example.com`, password: "Wazabolt2026" };
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
  // Open every day 08:00–18:00 in Douala, so tomorrow always has slots.
  sql(`update public.businesses set onboarding_step = 6, onboarding_completed_at = now(), timezone = 'Africa/Douala',
       opening_hours = (select jsonb_object_agg(d, '{"closed":false,"open":"08:00","close":"18:00"}'::jsonb) from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d)
       where id = '${biz.id}'`);
  const [customer] = await post(tok, "customers", { business_id: biz.id, whatsapp_phone: "237670000444", name: "Brenda" });

  // ------------------------------------------------------------ setup
  await page.goto(`${APP}/en/dashboard/appointments`);
  ok("appointments: explains booking is off", (await main.getByText(/Booking is off/).count()) === 1 && (await main.getByRole("link", { name: "New appointment" }).count()) === 0);
  await main.getByRole("tab", { name: "Services & settings" }).click();
  await page.waitForURL(/\/appointments\/setup/);
  await main.getByLabel("Take bookings").check();
  await main.getByLabel("Minimum notice (hours)").fill("0");
  await main.getByRole("button", { name: "Save" }).first().click();
  await main.getByText("Booking settings saved.").waitFor({ timeout: 10000 });
  const addForm = main.locator("form").last();
  await addForm.getByLabel("Name").fill("Tresses");
  await addForm.getByLabel("Duration (minutes)").fill("60");
  await addForm.getByLabel(/^Price/).fill("5000");
  await addForm.getByRole("button", { name: "Add a service" }).click();
  await main.locator("li").getByText("60 min").waitFor({ timeout: 10000 });
  const [settings] = await get(tok, "booking_settings?select=enabled,min_notice_minutes,slot_minutes,capacity");
  const [service] = await get(tok, "services?select=id,name,duration_minutes,price");
  ok("booking switched on and a service added", settings.enabled && settings.min_notice_minutes === 0 && service?.name === "Tresses" && Number(service.price) === 5000, JSON.stringify({ settings, service }));
  await page.screenshot({ path: "test-results/stage6-setup.png", fullPage: true });

  // ------------------------------------------------------- dashboard booking
  await page.goto(`${APP}/en/dashboard/appointments/new?customer=${customer.id}`);
  await main.getByLabel("Date").fill(tomorrow);
  await waitFor(async () => (await main.getByLabel("Time").locator("option").count()) > 5);
  const times = await main.getByLabel("Time").locator("option").allInnerTexts();
  ok("only free times inside opening hours are offered", times.includes("08:00") && times.includes("17:00") && !times.includes("17:30") && !times.includes("07:30"), times.slice(0, 4).join(","));
  await main.getByLabel("Time").selectOption("10:00");
  await main.getByRole("button", { name: "Book" }).click();
  await page.waitForURL(/\/dashboard\/appointments\?booked=1/);
  ok("booked from the dashboard and shown in the calendar", (await main.getByText("10:00–11:00").count()) === 1 && (await main.getByText("Appointment booked.").count()) === 1);
  await page.goto(`${APP}/en/dashboard/appointments/new?customer=${customer.id}`);
  await main.getByLabel("Date").fill(tomorrow);
  await waitFor(async () => (await main.getByLabel("Time").locator("option").count()) > 5);
  const after = await main.getByLabel("Time").locator("option").allInnerTexts();
  ok("a booked time (and overlapping ones) are no longer offered", !after.includes("10:00") && !after.includes("09:30") && !after.includes("10:30") && after.includes("11:00"));

  await page.goto(`${APP}/en/dashboard/appointments`);
  await main.getByRole("button", { name: "Confirm" }).first().click();
  await main.getByText("Confirmed", { exact: true }).waitFor({ timeout: 10000 });
  ok("appointment confirmed", true);
  await page.screenshot({ path: "test-results/stage6-calendar.png", fullPage: true });

  // ------------------------------------------------------- assistant (test chat)
  const savedBefore = (await get(tok, "appointments?select=id")).length;
  await page.goto(`${APP}/en/dashboard/ai/test`);
  const chatInput = main.getByLabel("Write as a customer would…");
  await chatInput.fill("Bonjour, je voudrais un rendez-vous pour des tresses");
  await chatInput.press("Enter");
  await main.getByText(/Rendez-vous confirmé : Tresses le \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\./).waitFor({ timeout: 20000 });
  ok("test chat: the assistant finds a free time and books (simulated)", (await get(tok, "appointments?select=id")).length === savedBefore && (await main.getByText("Looked up: free times, appointment (simulated)").count()) === 1);
  const req = claude.requests.at(-1);
  ok("assistant gets the services and the booking tools", req.body.system[1].text.includes("Services customers can book") && req.body.tools.some((t) => t.name === "bookAppointment"));

  // ------------------------------------------------------- assistant (WhatsApp)
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByLabel("Phone Number ID").fill(FAKE.phoneNumberId);
  await main.getByLabel("WhatsApp Business Account ID").fill(FAKE.wabaId);
  await main.getByLabel("Access token").fill("GOOD-token-abcdefghijklmn1234");
  await main.getByRole("button", { name: "Connect WhatsApp" }).click();
  await main.getByText("Connected", { exact: true }).waitFor({ timeout: 15000 });
  await deliver("Bonsoir, je peux avoir un rendez-vous ?");
  const reply = await waitFor(() => graph.sent().sent.map((m) => m.text?.body ?? "").find((t) => t.startsWith("Rendez-vous confirmé")), 30000);
  const viaWa = await waitFor(async () => (await get(tok, "appointments?select=id,conversation_id,service_name,status&conversation_id=not.is.null"))[0]);
  ok("WhatsApp: the assistant books a real appointment for the customer", !!reply && viaWa?.service_name === "Tresses" && viaWa.status === "booked", JSON.stringify({ reply, viaWa }));
  await page.goto(`${APP}/en/dashboard/appointments`);
  ok("calendar marks bookings made on WhatsApp", (await main.getByText(/Booked on WhatsApp/).count()) >= 1);
  await page.goto(`${APP}/en/dashboard`);
  await main.getByRole("heading", { name: "Upcoming appointments" }).waitFor({ timeout: 10000 }).catch(() => {});
  ok("dashboard home lists upcoming appointments", (await main.getByRole("heading", { name: "Upcoming appointments" }).count()) === 1);

  // Cancel from the calendar frees the time again.
  await page.goto(`${APP}/en/dashboard/appointments`);
  const cancels = await main.getByRole("button", { name: "Cancel" }).count();
  await main.getByRole("button", { name: "Cancel" }).first().click();
  await waitFor(async () => (await main.getByRole("button", { name: "Cancel" }).count()) === cancels - 1);
  ok("appointment cancelled from the calendar", (await main.getByText("Cancelled", { exact: true }).count()) >= 1);

  // Phone layout + French.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/dashboard/appointments", "/dashboard/appointments/setup", "/dashboard/appointments/new"]) {
    await page.goto(`${APP}/en${p}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`no horizontal overflow at 390px on ${p}`, over <= 1, `+${over}px`);
  }
  await page.goto(`${APP}/fr/dashboard/appointments`);
  ok("appointments in French", (await main.getByRole("heading", { name: "Rendez-vous", exact: true }).count()) === 1);

  // Leave the shared fake number free for other suites.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP}/en/dashboard/whatsapp`);
  await main.getByRole("button", { name: "Disconnect" }).click();
  await main.getByRole("button", { name: "Disconnect" }).last().click();
  await main.getByText("Not Connected").waitFor({ timeout: 15000 });

  ok("no browser errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  graph.close();
  claude.close();
  await browser.close();
  process.exit();
})().catch((e) => {
  console.error(e);
  console.log(results.join("\n"));
  process.exit(1);
});
