"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { expenseSchema } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * Business expenses (owners and admins). Row-level security enforces the
 * same rule in the database; the business id never comes from the form.
 */

export async function saveExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = expenseSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const id = String(formData.get("id") ?? "");
  if (id && !isUuid(id)) return fail("invalid");
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("expenses").update(parsed.data).eq("id", id).eq("business_id", ctx.business.id).select("id").maybeSingle()
    : await supabase.from("expenses").insert({ ...parsed.data, business_id: ctx.business.id }).select("id").single();
  if (error) {
    logServerError("expenses.save", error);
    return fail(dbError(error));
  }
  if (!data) return fail("not_found");
  revalidatePath("/[lang]/dashboard", "layout");
  const locale = formData.get("locale");
  if (id && isLocale(locale)) redirect(localizePath(locale, `/dashboard/expenses?month=${parsed.data.spent_on.slice(0, 7)}&saved=1`));
  return ok(data.id);
}

export async function deleteExpense(id: string, locale: string): Promise<FormState> {
  if (!isUuid(id)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).eq("business_id", ctx.business.id).select("id").maybeSingle();
  if (error) {
    logServerError("expenses.delete", error);
    return fail(dbError(error));
  }
  if (!data) return fail("not_found");
  revalidatePath("/[lang]/dashboard", "layout");
  if (isLocale(locale)) redirect(localizePath(locale, "/dashboard/expenses?deleted=1"));
  return ok();
}
