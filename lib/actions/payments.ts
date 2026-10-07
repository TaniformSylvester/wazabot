"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
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
 * same database functions with its own reference.
 */

const paymentSchema = z.object({
  amount: money.refine((v) => v > 0, "invalid_number"),
  method: z.enum(RECEIVE_METHODS, { error: "invalid_option" }),
  reference: optionalText(100),
  client_key: z.uuid(),
});

function paymentError(error: { code?: string; message?: string } | null): FormState {
  if (error?.message?.includes("more than what is owed")) return fail("invalid", { amount: ["more_than_owed"] });
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
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_order_payment", {
    p_business_id: ctx.business.id,
    p_order_id: orderId.data,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? undefined,
    p_client_key: parsed.data.client_key,
  });
  if (error) {
    logServerError("payments.order", error);
    return paymentError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
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
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_customer_payment", {
    p_business_id: ctx.business.id,
    p_customer_id: customerId.data,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? undefined,
    p_client_key: parsed.data.client_key,
  });
  if (error) {
    logServerError("payments.customer", error);
    return paymentError(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(customerId.data);
}
