"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { customerSchema } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/** Create or edit a customer (agents and above). */
export async function saveCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const parsed = customerSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const id = String(formData.get("id") ?? "");
  if (id && !isUuid(id)) return fail("invalid");
  const { preferred_language, whatsapp_phone, name, ...others } = parsed.data;
  const rest = { ...others, name: name ?? "" };
  const language = {
    preferred_language,
    preferred_language_source: preferred_language ? ("set_by_business" as const) : null,
    preferred_language_updated_at: preferred_language ? new Date().toISOString() : null,
  };

  const supabase = await createClient();
  let customerId = id;
  if (id) {
    // The WhatsApp number identifies the customer on WhatsApp and can't be changed afterwards.
    const { error } = await supabase.from("customers").update({ ...rest, ...language }).eq("id", id).eq("business_id", ctx.business.id);
    if (error) {
      logServerError("customers.update", error);
      return fail(dbError(error));
    }
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...rest, ...language, whatsapp_phone, business_id: ctx.business.id })
      .select("id")
      .single();
    if (error || !data) {
      logServerError("customers.insert", error);
      const key = dbError(error);
      return fail(key, key === "duplicate" ? { whatsapp_phone: ["duplicate_customer"] } : undefined);
    }
    customerId = data.id;
  }

  revalidatePath("/[lang]/dashboard", "layout");
  const locale = formData.get("locale");
  if (!id && isLocale(locale)) redirect(localizePath(locale, `/dashboard/customers/${customerId}?saved=1`));
  return ok(customerId);
}

/** Deleting is limited to admins; customers with orders can't be deleted (orders keep their history). */
export async function deleteCustomer(customerId: string, locale: string): Promise<FormState> {
  if (!isUuid(customerId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId).eq("business_id", ctx.business.id);
  if (error) {
    logServerError("customers.delete", error);
    return fail(error.code === "23503" ? "invalid" : dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  if (isLocale(locale)) redirect(localizePath(locale, "/dashboard/customers?deleted=1"));
  return ok();
}
