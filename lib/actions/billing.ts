"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { logServerError } from "@/lib/log";
import { notifyTeamOfPlanRequest } from "@/lib/admin/plan-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPlanAccess } from "@/lib/billing/plan-access";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";
import { denied } from "./denied";

/*
 * Plan changes and renewals, monthly or yearly (prepaid). No payment is
 * processed in WazaBolt itself: the owner or an admin asks for a plan, the
 * WazaBolt team arranges payment (Mobile Money, bank transfer) and approves
 * the request with the payment, which switches or extends the plan.
 */

const requestSchema = z.object({
  plan_id: z.enum(["boutique", "business", "multishop"], "required"),
  billing_interval: z.enum(["month", "year"]).default("month"),
  // The AI add-on with the plan ("": none, the default). Only once AI launches.
  addon_id: z.enum(["", "ai_basic", "ai_plus"]).optional().transform((v) => v || undefined),
  accept_meta_notice: z.literal("on").optional(),
  contact_phone: z.string().trim().max(40, "too_long").optional().transform((v) => v || undefined),
  note: z.string().trim().max(500, "too_long").optional().transform((v) => v || undefined),
});

export async function requestPlanChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin", { whileAwaitingPlan: true });
  if (!ctx) return denied();
  const parsed = requestSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.addon_id) {
    // "Coming soon" until launched (the database refuses it too); the Meta fees notice must be accepted.
    const access = await getPlanAccess(ctx.business.id);
    if (!access?.aiLaunched) return fail("ai_not_launched");
    if (!access.metaNoticeAcceptedAt && !parsed.data.accept_meta_notice) return fail("meta_notice_required", { accept_meta_notice: ["required"] });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_plan_change", {
    p_business_id: ctx.business.id,
    p_plan_id: parsed.data.plan_id,
    p_contact_phone: parsed.data.contact_phone,
    p_note: parsed.data.note,
    p_interval: parsed.data.billing_interval,
    p_addon_id: parsed.data.addon_id,
    p_accept_meta_notice: parsed.data.accept_meta_notice === "on",
  });
  if (error || !data) {
    logServerError("billing.request", error);
    return fail(error?.message?.includes("already on this plan") ? "already_on_plan" : dbError(error));
  }
  // Shows up in the server logs so the WazaBolt team notices new requests (ids only).
  console.info(`[billing.planRequest] business=${ctx.business.id} request=${data} plan=${parsed.data.plan_id}`);
  // And by email (after the response, so the owner doesn't wait on it).
  after(async () => {
    const admin = createAdminClient();
    if (admin) await notifyTeamOfPlanRequest(admin, data);
  });
  revalidatePath("/[lang]/dashboard/billing", "page");
  return ok(data);
}

export async function cancelPlanChange(requestId: string): Promise<FormState> {
  if (!isUuid(requestId)) return fail("invalid");
  const ctx = await authorize("admin", { whileAwaitingPlan: true });
  if (!ctx) return denied();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_plan_change", { p_request_id: requestId });
  if (error) {
    logServerError("billing.cancel", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/billing", "page");
  return ok(requestId);
}

/** A one-off AI top-up for this usage period (with the AI add-on; once AI launches). */
export async function requestAiTopup(): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return denied();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_ai_topup", { p_business_id: ctx.business.id, p_contact_phone: ctx.business.phone ?? undefined });
  if (error || !data) {
    logServerError("billing.topup", error);
    return fail(dbError(error));
  }
  console.info(`[billing.topupRequest] business=${ctx.business.id} request=${data}`);
  after(async () => {
    const admin = createAdminClient();
    if (admin) await notifyTeamOfPlanRequest(admin, data);
  });
  revalidatePath("/[lang]/dashboard/billing", "page");
  return ok(data);
}

/** Starts the free AI trial (once per business, once AI launches), after the Meta fees notice. */
export async function startAiTrial(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return denied();
  if (formData.get("accept_meta_notice") !== "on") return fail("meta_notice_required", { accept_meta_notice: ["required"] });
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_ai_trial", { p_business_id: ctx.business.id, p_accept_meta_notice: true });
  if (error) {
    logServerError("billing.aiTrial", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(ctx.business.id);
}
