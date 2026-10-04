"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { logServerError } from "@/lib/log";
import { notifyTeamOfPlanRequest } from "@/lib/admin/plan-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * Plan changes and renewals, monthly or yearly (prepaid). No payment is
 * processed in WazaBolt itself: the owner or an admin asks for a plan, the
 * WazaBolt team arranges payment (Mobile Money, bank transfer) and approves
 * the request with the payment, which switches or extends the plan.
 */

const requestSchema = z.object({
  plan_id: z.string().regex(/^[a-z0-9_]{2,32}$/, "required"),
  billing_interval: z.enum(["month", "year"]).default("month"),
  contact_phone: z.string().trim().max(40, "too_long").optional().transform((v) => v || undefined),
  note: z.string().trim().max(500, "too_long").optional().transform((v) => v || undefined),
});

export async function requestPlanChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = requestSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_plan_change", {
    p_business_id: ctx.business.id,
    p_plan_id: parsed.data.plan_id,
    p_contact_phone: parsed.data.contact_phone,
    p_note: parsed.data.note,
    p_interval: parsed.data.billing_interval,
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
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_plan_change", { p_request_id: requestId });
  if (error) {
    logServerError("billing.cancel", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/billing", "page");
  return ok(requestId);
}
