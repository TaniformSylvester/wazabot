"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentUserIsPlatformAdmin } from "@/lib/admin/access";
import { decidePlanRequest } from "@/lib/admin/plan-requests";
import { SETUP_FEE_RANGE } from "@/config/economics";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/billing/payments";
import { isAddonId, isPlanOnSale } from "@/lib/billing/price";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { isUuid } from "./form";

/** WazaBolt team: approve or decline a business's plan request (the customer is emailed). */
async function decide(formData: FormData, decision: "approved" | "rejected") {
  const locale = String(formData.get("locale") ?? "en");
  const back = (q: string) => redirect(`${localizePath(isLocale(locale) ? locale : "en", "/admin/plan-requests")}?${q}`);
  const id = String(formData.get("request_id") ?? "");
  const admin = createAdminClient();
  // Server actions are reachable directly: check the caller again.
  if (!admin || !(await currentUserIsPlatformAdmin())) back("error=forbidden");
  if (!isUuid(id)) back("error=invalid");
  let payment;
  if (decision === "approved") {
    // The payment received: recorded with the plan change (subscription_payments).
    const raw = String(formData.get("amount") ?? "").replace(/[\s,]/g, "");
    const amount = raw === "" ? NaN : Number(raw);
    const method = String(formData.get("method") ?? "mobile_money");
    const reference = String(formData.get("reference") ?? "").trim().slice(0, 100) || null;
    if (!Number.isFinite(amount) || amount < 0 || !(PAYMENT_METHODS as readonly string[]).includes(method)) back("error=payment");
    const { data } = await (await createClient()).auth.getUser();
    payment = { amount, method: method as PaymentMethod, reference, actorUserId: data.user?.id ?? null, setupFeePaid: formData.get("setup_fee_paid") === "on" };
  }
  const result = await decidePlanRequest(admin!, id, decision, payment);
  revalidatePath("/[lang]/admin/plan-requests", "page");
  revalidatePath("/[lang]/dashboard", "layout");
  back(result.ok ? `done=${decision}` : `error=${result.error}`);
}

/** WazaBolt team: the kill switch — pause or resume a business's assistant (and its test chat). */
export async function setAiPaused(formData: FormData) {
  const locale = String(formData.get("locale") ?? "en");
  const back = (q: string) => redirect(`${localizePath(isLocale(locale) ? locale : "en", "/admin/businesses")}?${q}`);
  const id = String(formData.get("business_id") ?? "");
  const pause = formData.get("pause") === "1";
  const admin = createAdminClient();
  if (!admin || !(await currentUserIsPlatformAdmin())) back("error=forbidden");
  if (!isUuid(id)) back("error=invalid");
  const { data } = await (await createClient()).auth.getUser();
  const { error } = await admin!
    .from("platform_business_controls")
    .upsert({ business_id: id, ai_paused: pause, reason: pause ? "Paused by the WazaBolt team" : null, updated_by: data.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) back("error=failed");
  console.info(`[admin.killSwitch] business=${id} paused=${pause}`);
  revalidatePath("/[lang]/admin/businesses", "page");
  revalidatePath("/[lang]/dashboard", "layout");
  back(`done=${pause ? "paused" : "resumed"}`);
}

export async function approvePlanRequest(formData: FormData) {
  await decide(formData, "approved");
}

export async function declinePlanRequest(formData: FormData) {
  await decide(formData, "rejected");
}

/** For the admin forms below: back to the businesses page with a notice. */
function backToBusinesses(formData: FormData, q: string): never {
  const locale = String(formData.get("locale") ?? "en");
  redirect(`${localizePath(isLocale(locale) ? locale : "en", "/admin/businesses")}?${q}`);
}

async function adminContext(formData: FormData) {
  const admin = createAdminClient();
  if (!admin || !(await currentUserIsPlatformAdmin())) backToBusinesses(formData, "error=forbidden");
  const { data } = await (await createClient()).auth.getUser();
  return { admin: admin!, actor: data.user?.id ?? null };
}

/**
 * WazaBolt team: record a payment received outside WazaBolt (MTN MoMo,
 * Orange Money, cash, bank) for a business, with the plan and AI add-on it
 * pays for. Filed as a plan request and approved at once, exactly like
 * approving one the business sent (same period rules, emails, audit).
 */
export async function recordManualPayment(formData: FormData) {
  const { admin, actor } = await adminContext(formData);
  const id = String(formData.get("business_id") ?? "");
  const planId = String(formData.get("plan_id") ?? "");
  const addonRaw = String(formData.get("addon_id") ?? "");
  const interval = formData.get("billing_interval") === "year" ? "year" : "month";
  const raw = String(formData.get("amount") ?? "").replace(/[\s,]/g, "");
  const amount = raw === "" ? NaN : Number(raw);
  const method = String(formData.get("method") ?? "mobile_money");
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 100) || null;
  if (!isUuid(id) || !isPlanOnSale(planId) || (addonRaw && !isAddonId(addonRaw))) backToBusinesses(formData, "error=invalid");
  if (!Number.isFinite(amount) || amount < 0 || !(PAYMENT_METHODS as readonly string[]).includes(method)) backToBusinesses(formData, "error=payment_invalid");
  if (addonRaw) {
    const { data: launched } = await admin.rpc("ai_assistant_launched");
    if (launched !== true) backToBusinesses(formData, "error=ai_not_launched");
  }
  const { data: sub } = await admin.from("subscriptions").select("plan_id, addon_id, status").eq("business_id", id).maybeSingle();
  if (!sub) backToBusinesses(formData, "error=invalid");
  await admin.from("plan_change_requests").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("business_id", id).eq("status", "pending");
  const renewal = sub!.plan_id === planId && (sub!.addon_id ?? "") === addonRaw && sub!.status !== "trialing";
  const { data: req, error } = await admin
    .from("plan_change_requests")
    .insert({ business_id: id, from_plan_id: sub!.plan_id, to_plan_id: planId, addon_id: addonRaw || null, requested_by: actor, billing_interval: interval, kind: renewal ? "renewal" : "change", note: "Payment recorded by the WazaBolt team." })
    .select("id")
    .single();
  if (error || !req) backToBusinesses(formData, "error=failed");
  const result = await decidePlanRequest(admin, req!.id, "approved", { amount, method: method as PaymentMethod, reference, actorUserId: actor, setupFeePaid: formData.get("setup_fee_paid") === "on" });
  revalidatePath("/[lang]/admin/businesses", "page");
  revalidatePath("/[lang]/dashboard", "layout");
  backToBusinesses(formData, result.ok ? "done=payment" : `error=${result.error}`);
}

/** WazaBolt team: a business's one-off setup fee (0, or 10,000–25,000 FCFA). */
export async function setSetupFee(formData: FormData) {
  const { admin, actor } = await adminContext(formData);
  const id = String(formData.get("business_id") ?? "");
  const amount = Number(String(formData.get("setup_fee") ?? "").replace(/[\s,]/g, ""));
  if (!isUuid(id) || !Number.isFinite(amount) || !(amount === 0 || (amount >= SETUP_FEE_RANGE.min && amount <= SETUP_FEE_RANGE.max))) backToBusinesses(formData, "error=setup_fee_invalid");
  const { error } = await admin.rpc("admin_set_setup_fee", { p_business_id: id, p_amount: amount, p_actor: actor ?? undefined });
  if (error) backToBusinesses(formData, "error=failed");
  revalidatePath("/[lang]/admin/businesses", "page");
  backToBusinesses(formData, "done=setup_fee");
}

/** WazaBolt team: more days of free trial for a business (1–90). */
export async function extendTrial(formData: FormData) {
  const { admin, actor } = await adminContext(formData);
  const id = String(formData.get("business_id") ?? "");
  const days = Number(formData.get("days"));
  if (!isUuid(id) || !Number.isInteger(days) || days < 1 || days > 90) backToBusinesses(formData, "error=invalid");
  const { error } = await admin.rpc("admin_extend_trial", { p_business_id: id, p_days: days, p_actor: actor ?? undefined });
  if (error) backToBusinesses(formData, error.message.includes("paid plan") ? "error=paid_plan" : "error=failed");
  revalidatePath("/[lang]/admin/businesses", "page");
  revalidatePath("/[lang]/dashboard", "layout");
  backToBusinesses(formData, "done=trial");
}

/** WazaBolt team: launch (or pause) the WhatsApp AI assistant for every business. Until then it's "coming soon". */
export async function setAiLaunched(formData: FormData) {
  const { admin, actor } = await adminContext(formData);
  const on = formData.get("on") === "1";
  const { error } = await admin.rpc("admin_set_ai_launched", { p_on: on, p_actor: actor ?? undefined });
  if (error) backToBusinesses(formData, "error=failed");
  console.info(`[admin.aiLaunched] on=${on}`);
  revalidatePath("/", "layout");
  backToBusinesses(formData, on ? "done=ai_on" : "done=ai_off");
}
