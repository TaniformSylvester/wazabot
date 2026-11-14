"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { EVERYONE, OWNER, requireRoleForAction } from "@/lib/auth/requireRole";
import { SAMPLE_BANNER_COOKIE, hiddenSampleBanners } from "@/lib/onboarding/sample-banner";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

import { dbError, fail, ok, type FormState } from "./form";
import { denied } from "./denied";

/*
 * The sample data a new workspace starts with (lib/onboarding/seedVertical.ts).
 * Clearing is for the owner only, and deletes only this business's rows still
 * marked as sample (the database function checks both again).
 */

export async function clearSampleData(): Promise<FormState> {
  const ctx = await requireRoleForAction(OWNER, { readOnlyOk: true });
  if (!ctx) return denied();
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_sample_data", { p_business_id: ctx.business.id });
  if (error) {
    logServerError("sampleData.clear", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok();
}

/** Hides the banner for this business, in this browser (the sample data stays until the owner clears it). */
export async function dismissSampleBanner(): Promise<FormState> {
  const ctx = await requireRoleForAction(EVERYONE, { access: "read", readOnlyOk: true, whileAwaitingPlan: true });
  if (!ctx) return denied();
  const jar = await cookies();
  const hidden = hiddenSampleBanners(jar.get(SAMPLE_BANNER_COOKIE)?.value);
  const next = [ctx.business.id, ...hidden.filter((id) => id !== ctx.business.id)].slice(0, 20);
  jar.set(SAMPLE_BANNER_COOKIE, next.join("."), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/[lang]/dashboard", "layout");
  return ok();
}
