"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { notifyTeamOfPlanRequest } from "@/lib/admin/plan-requests";
import { setActiveBusiness } from "@/lib/auth/active-business";
import { getCurrentUser } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SIGNUP_BUSINESS_TYPES } from "@/lib/validation/auth";

import { dbError, fail, formObject, invalid, type FormState } from "./form";

/*
 * Several businesses under one login. The database function create_business
 * sets the business up like a sign-up and enforces the rules (signed in, one
 * Free business per owner, a paid plan request otherwise); this action only
 * shapes the input, then opens the new business.
 */

const createSchema = z.object({
  name: z.string().trim().min(2, "business_required").max(120, "too_long"),
  type: z.enum(SIGNUP_BUSINESS_TYPES, "business_type_required"),
  plan_id: z.string().regex(/^[a-z0-9_]{2,32}$/, "required").optional().or(z.literal("").transform(() => undefined)),
  billing_interval: z.enum(["month", "year"]).default("month"),
  contact_phone: z.string().trim().max(40, "too_long").optional().transform((v) => v || undefined),
  locale: z.string().optional(),
});

export async function createBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return fail("forbidden");
  const parsed = createSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_business", {
    p_name: v.name,
    p_industry: v.type,
    p_plan: v.plan_id,
    p_interval: v.billing_interval,
    p_contact_phone: v.contact_phone,
  });
  if (error || !id) {
    logServerError("businesses.create", error);
    return fail(dbError(error), error?.code === "WB451" ? { plan_id: ["required"] } : undefined);
  }

  // A plan request was filed: tell the WazaBolt team, as for any plan request.
  const { data: request } = await supabase.from("plan_change_requests").select("id").eq("business_id", id).eq("status", "pending").maybeSingle();
  if (request) {
    console.info(`[billing.planRequest] business=${id} request=${request.id} plan=${v.plan_id} new_business=1`);
    after(async () => {
      const admin = createAdminClient();
      if (admin) await notifyTeamOfPlanRequest(admin, request.id);
    });
  }

  await setActiveBusiness(id);
  revalidatePath("/[lang]/dashboard", "layout");
  const locale = isLocale(v.locale) ? v.locale : user.uiLocale;
  redirect(localizePath(locale, request ? "/dashboard/billing?new=1" : "/dashboard/onboarding"));
}
