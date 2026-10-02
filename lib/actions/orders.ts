"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { orderSchema, orderUpdateSchema } from "@/lib/validation/app";

import { dbError, dbFail, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/**
 * Records an order (e.g. taken by phone or in a chat). Prices, names and
 * totals are computed by create_order() in the database from the catalog —
 * never trusted from the browser. No payment is taken.
 */
export async function createOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const parsed = orderSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const o = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_business_id: ctx.business.id,
    p_customer_id: o.customer_id,
    p_items: o.items,
    p_conversation_id: o.conversation_id ?? undefined,
    p_delivery_fee: o.delivery_fee,
    p_discount: o.discount,
    p_delivery_address: o.delivery_address ?? undefined,
    p_payment_method: o.payment_method ?? undefined,
    p_notes: o.notes ?? undefined,
  });
  if (error || !data) {
    logServerError("orders.create", error);
    const key = dbError(error);
    if (key === "out_of_stock") return dbFail(error);
    return fail(key, key === "invalid" && error?.message?.includes("discount") ? { discount: ["discount_too_large"] } : undefined);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  const locale = formData.get("locale");
  if (isLocale(locale)) redirect(localizePath(locale, `/dashboard/orders/${data}?saved=1`));
  return ok(data);
}

/** Status, payment status (recorded by hand), delivery address and notes. Amounts are fixed once created. */
export async function updateOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return fail("invalid");
  const parsed = orderUpdateSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").update(parsed.data).eq("id", id).eq("business_id", ctx.business.id).select("id");
  if (error) {
    logServerError("orders.update", error);
    return dbFail(error);
  }
  if (!data?.length) return fail("not_found");
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(id);
}

export async function deleteOrder(orderId: string, locale: string): Promise<FormState> {
  if (!isUuid(orderId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from("orders").delete().eq("id", orderId).eq("business_id", ctx.business.id);
  if (error) {
    logServerError("orders.delete", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  if (isLocale(locale)) redirect(localizePath(locale, "/dashboard/orders?deleted=1"));
  return ok();
}
