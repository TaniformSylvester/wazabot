"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { emit } from "@/lib/core/events";
import { localDayStart, localToday } from "@/lib/data/queries";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { money, optionalText } from "@/lib/validation/app";
import { RECEIVE_METHODS } from "@/types/database";

import { dbError, fail, formObject, invalid, ok, type FormState } from "./form";

/*
 * Payments received for sales, recorded by hand (cash, MTN MoMo, Orange
 * Money, bank transfer…). The database checks the amount against what is
 * owed and keeps the ledger; the form's client_key makes a double click
 * record the payment once. A payment provider integration would call the
 * same database functions with its own reference. A reference typed here is
 * not a verification of the payment.
 */

const paymentSchema = z.object({
  amount: money.refine((v) => v > 0, "invalid_number"),
  method: z.enum(RECEIVE_METHODS, { error: "invalid_option" }),
  reference: optionalText(100),
  note: optionalText(500),
  /** Day the money was received (business time zone); empty = now. */
  received_on: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date").optional()),
  client_key: z.uuid(),
});

/** The moment recorded for a payment: now for today, midday of an earlier day, refused for a later day. */
function receivedAt(day: string | undefined, timezone: string): string | null | "future" {
  if (!day) return null;
  const today = localToday(timezone);
  if (day > today) return "future";
  if (day === today) return null;
  return new Date(new Date(localDayStart(day, timezone)).getTime() + 12 * 3600 * 1000).toISOString();
}

function paymentError(error: { code?: string; message?: string } | null): FormState {
  const m = error?.message ?? "";
  if (m.includes("more than what is owed")) return fail("invalid", { amount: ["more_than_owed"] });
  if (m.includes("more than what was paid")) return fail("invalid", { amount: ["refund_more_than_paid"] });
  if (m.includes("in the future")) return fail("invalid", { received_on: ["payment_date_future"] });
  if (m.includes("cancelled or returned")) return fail("invalid", { amount: [m.startsWith("refunds") ? "refund_not_allowed" : "order_closed"] });
  if (m.includes("void the refund first")) return fail("invalid", { reason: ["void_refund_first"] });
  if (m.includes("give a reason")) return fail("invalid", { reason: ["reason_required"] });
  return fail(dbError(error));
}

/** Agents and up: a payment towards one sale or order. */
export async function recordOrderPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const orderId = z.uuid().safeParse(formData.get("order_id"));
  const parsed = paymentSchema.safeParse(formObject(formData));
  if (!orderId.success) return fail("invalid");
  if (!parsed.success) return invalid(parsed.error);
  const at = receivedAt(parsed.data.received_on, ctx.business.timezone);
  if (at === "future") return fail("invalid", { received_on: ["payment_date_future"] });
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_order_payment", {
    p_business_id: ctx.business.id,
    p_order_id: orderId.data,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? undefined,
    p_client_key: parsed.data.client_key,
    p_received_at: at ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) {
    logServerError("payments.order", error);
    return paymentError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  const event = { type: "payment.recorded", businessId: ctx.business.id, customerId: null, orderId: orderId.data, amount: parsed.data.amount } as const;
  after(() => emit(event));
  return ok(orderId.data);
}

/** Agents and up: a customer pays towards what they owe (oldest sales first). */
export async function recordCustomerPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const customerId = z.uuid().safeParse(formData.get("customer_id"));
  const parsed = paymentSchema.safeParse(formObject(formData));
  if (!customerId.success) return fail("invalid");
  if (!parsed.success) return invalid(parsed.error);
  const at = receivedAt(parsed.data.received_on, ctx.business.timezone);
  if (at === "future") return fail("invalid", { received_on: ["payment_date_future"] });
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_customer_payment", {
    p_business_id: ctx.business.id,
    p_customer_id: customerId.data,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? undefined,
    p_client_key: parsed.data.client_key,
    p_received_at: at ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) {
    logServerError("payments.customer", error);
    return paymentError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  const event = { type: "payment.recorded", businessId: ctx.business.id, customerId: customerId.data, orderId: null, amount: parsed.data.amount } as const;
  after(() => emit(event));
  return ok(customerId.data);
}

/** Owners/admins: money given back for a cancelled or returned order. */
export async function recordOrderRefund(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const orderId = z.uuid().safeParse(formData.get("order_id"));
  const parsed = paymentSchema.safeParse(formObject(formData));
  if (!orderId.success) return fail("invalid");
  if (!parsed.success) return invalid(parsed.error);
  const at = receivedAt(parsed.data.received_on, ctx.business.timezone);
  if (at === "future") return fail("invalid", { received_on: ["payment_date_future"] });
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_order_refund", {
    p_business_id: ctx.business.id,
    p_order_id: orderId.data,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? undefined,
    p_client_key: parsed.data.client_key,
    p_received_at: at ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) {
    logServerError("payments.refund", error);
    return paymentError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(orderId.data);
}

/** Owners/admins: void a payment or refund recorded by mistake (it stays in the history). */
export async function voidPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ group_id: z.uuid({ error: "required" }), reason: z.string().trim().min(3, "reason_required").max(300, "too_long") }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", { p_business_id: ctx.business.id, p_group_id: parsed.data.group_id, p_reason: parsed.data.reason });
  if (error) {
    logServerError("payments.void", error);
    return paymentError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(parsed.data.group_id);
}
