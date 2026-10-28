"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { notifyTeamOfPlanRequest } from "@/lib/admin/plan-requests";
import { authorize } from "@/lib/auth/dal";
import { WORKING_BRANCH_COOKIE, getBranchContext } from "@/lib/branches";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * Branches: owners and admins open, edit, pause and reopen locations, ask for
 * extra branches, and tie team members to a branch. The database enforces the
 * plan's number of locations (WB452) and who may do what.
 */

const optional = (max: number) => z.string().trim().max(max, "too_long").optional().transform((v) => v || null);
const branchSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  name: z.string().trim().min(1, "required").max(80, "too_long"),
  address: optional(300),
  city: optional(80),
  phone: optional(40),
  hours: optional(300),
});

export async function saveBranch(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = branchSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("branches").update(fields).eq("id", id).eq("business_id", ctx.business.id).select("id").maybeSingle()
    : await supabase.from("branches").insert({ business_id: ctx.business.id, ...fields }).select("id").single();
  if (error || !data) {
    logServerError("branches.save", error);
    return fail(error ? dbError(error) : "not_found");
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(data.id);
}

/** Pause a branch (no sales there; its stock and history stay) or reopen it (needs room in the plan). */
export async function setBranchActive(branchId: string, active: boolean): Promise<FormState> {
  if (!isUuid(branchId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").update({ active }).eq("id", branchId).eq("business_id", ctx.business.id).select("id").maybeSingle();
  if (error || !data) {
    logServerError("branches.active", error);
    return fail(error ? dbError(error) : "not_found");
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(branchId);
}

/** Owners and admins: work in another branch (only a preference; members tied to a branch can't switch). */
export async function switchBranch(branchId: string, locale: string, path: string) {
  const ctx = await authorize("viewer");
  if (ctx && isUuid(branchId)) {
    const { branches, locked } = await getBranchContext(ctx.business);
    if (!locked && branches.some((b) => b.id === branchId)) {
      (await cookies()).set(WORKING_BRANCH_COOKIE, branchId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
    }
  }
  revalidatePath("/[lang]/dashboard", "layout");
  // Back to the same page (a dashboard path only).
  const safe = /^\/dashboard(\/[\w/-]*)?$/.test(path) ? path : "/dashboard";
  redirect(localizePath(isLocale(locale) ? locale : "en", safe));
}

const extraSchema = z.object({
  extra: z.coerce.number({ error: "invalid" }).int("invalid").min(0, "invalid").max(100, "invalid"),
  contact_phone: z.string().trim().max(40, "too_long").optional().transform((v) => v || undefined),
});

/** Ask WazaBolt for a number of extra branches (Business and Pro); approved once paid, like a plan change. */
export async function requestExtraBranches(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = extraSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_extra_branches", {
    p_business_id: ctx.business.id,
    p_extra: parsed.data.extra,
    p_contact_phone: parsed.data.contact_phone,
  });
  if (error || !data) {
    logServerError("branches.requestExtra", error);
    return fail(dbError(error), error?.code === "22023" ? { extra: ["invalid"] } : undefined);
  }
  console.info(`[billing.planRequest] business=${ctx.business.id} request=${data} extra_branches=${parsed.data.extra}`);
  after(async () => {
    const admin = createAdminClient();
    if (admin) await notifyTeamOfPlanRequest(admin, data);
  });
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(data);
}

/** Tie an agent, viewer or kitchen member to a branch (empty: every branch). */
export async function setMemberBranch(userId: string, branchId: string): Promise<FormState> {
  if (!isUuid(userId) || (branchId !== "" && !isUuid(branchId))) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_branch", { p_business_id: ctx.business.id, p_user_id: userId, p_branch_id: branchId || undefined });
  if (error) {
    logServerError("branches.member", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/team", "page");
  return ok(userId);
}
