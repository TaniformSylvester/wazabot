"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { notifyOrderStatus } from "@/lib/notifications/events";
import { runNotification } from "@/lib/notifications/run";
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
    p_delivery: {
      method: o.delivery_method,
      recipient_name: o.recipient_name,
      recipient_phone: o.recipient_phone,
      pickup_location: o.pickup_location,
      reference: o.delivery_reference,
      notes: o.delivery_notes,
    },
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

/**
 * Status, payment method, delivery details and notes. Amounts are fixed once
 * created; payment status follows the payments recorded. "Returned" is only
 * for delivered orders; an order with a refund stays cancelled or returned.
 */
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
    if (error.message?.includes("only a delivered order")) return fail("invalid", { status: ["return_not_delivered"] });
    if (error.message?.includes("has a refund")) return fail("invalid", { status: ["refunded_stays_closed"] });
    return dbFail(error);
  }
  if (!data?.length) return fail("not_found");
  // Tell the customer on WhatsApp (confirmed / ready / out for delivery / delivered), after the response.
  if (parsed.data.status) after(() => runNotification("orders.notify", (admin) => notifyOrderStatus(admin, ctx.business.id, id)));
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

/** Owners/admins: a sale recorded without a customer (walk-in) is linked to the customer who bought it. Once only. */
export async function linkOrderCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const orderId = String(formData.get("order_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  if (!isUuid(orderId)) return fail("invalid");
  if (!isUuid(customerId)) return fail("invalid", { customer_id: ["required"] });
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_order_customer", { p_business_id: ctx.business.id, p_order_id: orderId, p_customer_id: customerId });
  if (error) {
    logServerError("orders.link_customer", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(orderId);
}
