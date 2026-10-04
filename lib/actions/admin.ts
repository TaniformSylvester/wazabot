"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentUserIsPlatformAdmin } from "@/lib/admin/access";
import { decidePlanRequest } from "@/lib/admin/plan-requests";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/billing/payments";
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
    payment = { amount, method: method as PaymentMethod, reference, actorUserId: data.user?.id ?? null };
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
