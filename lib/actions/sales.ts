"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { money, normalizeWhatsAppNumber, optionalText } from "@/lib/validation/app";
import { RECEIVE_METHODS } from "@/types/database";

/*
 * The POS. The browser sends what was picked (products, quantities, the
 * customer, how they paid); create_sale() in the database computes prices
 * and totals from the catalog, takes the stock and records the payment in
 * one transaction. The client_key is fixed for the sale being rung up, so a
 * double tap or a retry after a lost connection returns the same sale.
 */

const saleSchema = z.object({
  client_key: z.uuid(),
  items: z
    .array(z.object({ product_id: z.uuid(), variant_id: z.uuid().nullable().optional(), quantity: z.number().int().min(1).max(100000) }))
    .min(1)
    .max(100),
  customer: z.union([
    z.null(),
    z.object({ id: z.uuid() }),
    z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,24}$/) }),
  ]),
  discount: money,
  payment: z.object({
    method: z.enum([...RECEIVE_METHODS, "credit"]),
    amount: money,
    reference: optionalText(100),
  }),
  notes: optionalText(500),
});
export type SaleInput = z.input<typeof saleSchema>;
export type SaleError = "forbidden" | "invalid" | "empty" | "customer" | "out_of_stock" | "credit_needs_customer" | "discount_not_allowed" | "too_much" | "failed";
export type SaleResult = { ok: true; id: string } | { ok: false; error: SaleError; item?: string };

export async function createSale(input: SaleInput): Promise<SaleResult> {
  const ctx = await authorize("agent");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0];
    return { ok: false, error: path === "items" ? "empty" : path === "customer" ? "customer" : "invalid" };
  }
  const s = parsed.data;
  const supabase = await createClient();

  // A new customer typed at the till: reuse the record if that number is already known.
  let customerId: string | null = s.customer && "id" in s.customer ? s.customer.id : null;
  if (s.customer && "phone" in s.customer) {
    const phone = normalizeWhatsAppNumber(s.customer.phone);
    const { data: found } = await supabase.from("customers").select("id").eq("business_id", ctx.business.id).eq("whatsapp_phone", phone).maybeSingle();
    if (found) customerId = found.id;
    else {
      const { data: created, error } = await supabase
        .from("customers")
        .insert({ business_id: ctx.business.id, whatsapp_phone: phone, name: s.customer.name })
        .select("id")
        .single();
      if (error || !created) {
        logServerError("sales.customer", error);
        return { ok: false, error: "customer" };
      }
      customerId = created.id;
    }
  }

  const payments = s.payment.method !== "credit" && s.payment.amount > 0 ? [{ method: s.payment.method, amount: s.payment.amount, reference: s.payment.reference }] : [];
  const { data, error } = await supabase.rpc("create_sale", {
    p_business_id: ctx.business.id,
    p_client_key: s.client_key,
    p_items: s.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id ?? null, quantity: i.quantity })),
    p_customer_id: customerId ?? undefined,
    p_discount: s.discount,
    p_payments: payments,
    p_notes: s.notes ?? undefined,
  });
  if (error || !data) {
    logServerError("sales.create", error);
    const m = error?.message ?? "";
    if (error?.code === "WB409") return { ok: false, error: "out_of_stock", item: m.replace(/^insufficient stock:\s*/, "").slice(0, 200) };
    if (m.includes("discount")) return { ok: false, error: "discount_not_allowed" };
    if (m.includes("credit needs a customer")) return { ok: false, error: "credit_needs_customer" };
    if (m.includes("more than the total")) return { ok: false, error: "too_much" };
    if (error?.code === "42501") return { ok: false, error: "forbidden" };
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return { ok: true, id: data };
}
