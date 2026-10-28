"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getBranchContext } from "@/lib/branches";
import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { money, optionalText, requiredText } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * WazaBolt Restaurants — every action calls a database function that checks
 * the role again (agents take orders; owners/admins manage tables; kitchen
 * staff move tickets). Prices always come from the menu in the database.
 */

const path = (locale: string, p: string) => localizePath(isLocale(locale) ? locale : "en", p);
const refresh = () => revalidatePath("/[lang]/dashboard", "layout");

const itemsSchema = z.preprocess(
  (v) => {
    if (typeof v !== "string" || !v.trim()) return [];
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  },
  z
    .array(
      z.object({
        product_id: z.uuid(),
        variant_id: z.uuid().nullable().optional(),
        quantity: z.number().int().min(1).max(999),
        extras: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
        note: z.string().trim().max(200).optional(),
      }),
      { error: "invalid" },
    )
    .min(1, "empty_order")
    .max(50, "too_many_items"),
);

const tableSchema = z.object({
  name: requiredText(40),
  area: optionalText(40),
  seats: z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number({ error: "invalid_integer" }).int("invalid_integer").min(1, "invalid_integer").max(100, "invalid_integer").nullable()),
});

/** Owners/admins: add a table, or rename one (id). */
export async function saveTable(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = tableSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const id = formData.get("id");
  const supabase = await createClient();
  const { error } =
    typeof id === "string" && id
      ? isUuid(id)
        ? await supabase.from("restaurant_tables").update(parsed.data).eq("id", id).eq("business_id", ctx.business.id)
        : { error: { code: "22023" } }
      : await supabase.from("restaurant_tables").insert({ ...parsed.data, business_id: ctx.business.id, branch_id: (await getBranchContext(ctx.business)).current.id });
  if (error) {
    if (error.code !== "23505") logServerError("restaurant.saveTable", error);
    return error.code === "23505" ? fail("duplicate", { name: ["duplicate"] }) : fail(dbError(error));
  }
  refresh();
  return ok();
}

/** Owners/admins: switch a table off (kept for past bills) or back on. */
export async function setTableActive(tableId: string, active: boolean): Promise<FormState> {
  if (!isUuid(tableId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from("restaurant_tables").update({ active }).eq("id", tableId).eq("business_id", ctx.business.id);
  if (error) return fail(dbError(error));
  refresh();
  return ok();
}

/** Agents: open a bill on a free table, then go to it. */
export async function openBill(tableId: string, locale: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(tableId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const guests = Number(formData.get("guests") || 0);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurant_open_order", {
    p_business_id: ctx.business.id,
    p_service_type: "dine_in",
    p_table_id: tableId,
    p_guests: Number.isInteger(guests) && guests >= 1 && guests <= 200 ? guests : undefined,
    p_branch_id: (await getBranchContext(ctx.business)).current.id,
  });
  if (error || !data) {
    if (error?.code !== "23505") logServerError("restaurant.openBill", error);
    return fail(error?.code === "23505" ? "table_busy" : dbError(error));
  }
  refresh();
  redirect(path(locale, `/dashboard/restaurant/orders/${data}`));
}

/** Agents: a takeaway or delivery order with its dishes (sent to the kitchen). */
export async function createRestaurantOrder(serviceType: "takeaway" | "delivery", locale: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const raw = formObject(formData);
  const items = itemsSchema.safeParse(raw.items);
  if (!items.success) return fail(items.error.issues[0]?.message === "empty_order" ? "empty_order" : "invalid", { items: [items.error.issues[0]?.message ?? "invalid"] });
  const details = z
    .object({ customer_id: z.uuid().or(z.literal("")).optional(), address: optionalText(300), phone: optionalText(24), notes: optionalText(1000), fee: money.optional() })
    .safeParse({ ...raw, fee: raw.fee === "" ? undefined : raw.fee });
  if (!details.success) return invalid(details.error);
  const d = details.data;
  if (serviceType === "delivery" && !d.customer_id) return fail("invalid", { customer_id: ["customer_required"] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurant_open_order", {
    p_business_id: ctx.business.id,
    p_service_type: serviceType,
    p_items: items.data,
    p_customer_id: d.customer_id || undefined,
    p_notes: d.notes ?? undefined,
    p_delivery: serviceType === "delivery" ? { address: d.address, recipient_phone: d.phone } : undefined,
    p_delivery_fee: serviceType === "delivery" ? (d.fee ?? 0) : 0,
    p_branch_id: (await getBranchContext(ctx.business)).current.id,
  });
  if (error || !data) {
    logServerError("restaurant.createOrder", error);
    return fail(dbError(error));
  }
  refresh();
  redirect(path(locale, `/dashboard/restaurant/orders/${data}`));
}

/** Agents: dishes added to an open order go to the kitchen as one round. */
export async function addDishes(orderId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(orderId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const items = itemsSchema.safeParse(formObject(formData).items);
  if (!items.success) return fail(items.error.issues[0]?.message === "empty_order" ? "empty_order" : "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("restaurant_add_items", { p_business_id: ctx.business.id, p_order_id: orderId, p_items: items.data, p_send: true });
  if (error) {
    logServerError("restaurant.addDishes", error);
    return fail(dbError(error));
  }
  refresh();
  return ok(orderId);
}

/** Agents: lines not sent yet (e.g. a WhatsApp order, checked) go to the kitchen. */
export async function sendToKitchen(orderId: string): Promise<FormState> {
  if (!isUuid(orderId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("restaurant_send_to_kitchen", { p_business_id: ctx.business.id, p_order_id: orderId });
  if (error) return fail(dbError(error));
  refresh();
  return ok(orderId);
}

/** Agents (before the kitchen starts) / owners and admins: take a line off, with a reason. */
export async function removeDish(itemId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(itemId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3 || reason.length > 300) return fail("invalid", { reason: ["required"] });
  const supabase = await createClient();
  const { error } = await supabase.rpc("restaurant_remove_item", { p_business_id: ctx.business.id, p_item_id: itemId, p_reason: reason });
  if (error) return fail(dbError(error));
  refresh();
  return ok();
}

/** Agents: close a bill paid in full. */
export async function closeBill(orderId: string): Promise<FormState> {
  if (!isUuid(orderId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("restaurant_close_bill", { p_business_id: ctx.business.id, p_order_id: orderId });
  if (error) return fail(dbError(error));
  refresh();
  return ok(orderId);
}

/** Kitchen screen: move a ticket to its next step. */
export async function moveTicket(ticketId: string, status: "preparing" | "ready" | "served"): Promise<FormState> {
  if (!isUuid(ticketId) || !["preparing", "ready", "served"].includes(status)) return fail("invalid");
  const ctx = await authorize("kitchen");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ticket_status", { p_ticket_id: ticketId, p_status: status });
  if (error) return fail(dbError(error));
  return ok(ticketId);
}
