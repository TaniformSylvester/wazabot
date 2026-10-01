import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";
import { isOpenAt, parseOpeningHours } from "@/lib/business/hours";

/*
 * Controlled tools the model may call. Each tool:
 *   - has a JSON-schema-compatible Zod input the model's arguments are validated against,
 *   - is scoped to ONE business: every query filters by ctx.businessId,
 *   - returns small, plain data — never raw rows, credentials or other tenants' data.
 * The model never gets database access; it only sees these results.
 */

export type ToolContext = {
  db: SupabaseClient<Database>;
  businessId: string;
  conversationId: string | null;
  customerId: string | null;
  /** Test chat: lookups are real, but nothing is written (orders, customer details, handovers are simulated). */
  dryRun?: boolean;
};

export type ToolDefinition<I extends z.ZodType, O> = {
  name: string;
  description: string;
  input: I;
  run: (ctx: ToolContext, input: z.infer<I>) => Promise<O>;
};

const tool = <I extends z.ZodType, O>(def: ToolDefinition<I, O>) => def;

export const getBusinessInformation = tool({
  name: "getBusinessInformation",
  description: "Business name, description, address, phone, website and whether it is open now.",
  input: z.object({}),
  async run(ctx) {
    const { data } = await ctx.db
      .from("businesses")
      .select("name, description, city, address, phone, website, timezone, opening_hours")
      .eq("id", ctx.businessId)
      .maybeSingle();
    if (!data) return null;
    return {
      name: data.name,
      description: data.description,
      city: data.city,
      address: data.address,
      phone: data.phone,
      website: data.website,
      openNow: isOpenAt(parseOpeningHours(data.opening_hours), data.timezone),
    };
  },
});

export const searchProducts = tool({
  name: "searchProducts",
  description: "Search active products by name, category or SKU. Only facts returned here may be told to customers.",
  input: z.object({ query: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(10).default(5) }),
  async run(ctx, { query, limit }) {
    const words = query.replace(/[%_,()*\\]/g, " ").trim();
    const { data } = await ctx.db
      .from("products")
      .select("id, name, description, category, price, currency, stock_quantity, product_variants(id, name, value, price_modifier, stock_quantity)")
      .eq("business_id", ctx.businessId)
      .eq("active", true)
      .or(`name.ilike.%${words}%,category.ilike.%${words}%,sku.ilike.%${words}%`)
      .limit(limit);
    return (data ?? []).map((p) => ({
      productId: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      price: Number(p.price),
      currency: p.currency,
      inStock: p.stock_quantity === null ? null : p.stock_quantity > 0,
      variants: p.product_variants.map((v) => ({
        variantId: v.id,
        label: `${v.name}: ${v.value}`,
        price: Math.max(0, Number(p.price) + Number(v.price_modifier)),
        inStock: v.stock_quantity === null ? null : v.stock_quantity > 0,
      })),
    }));
  },
});

export const checkProductStock = tool({
  name: "checkProductStock",
  description: "Current stock for one product (and optionally one variant). inStock is null when stock isn't tracked.",
  input: z.object({ productId: z.uuid(), variantId: z.uuid().optional() }),
  async run(ctx, { productId, variantId }) {
    const { data } = await ctx.db
      .from("products")
      .select("name, active, stock_quantity, product_variants(id, name, value, stock_quantity)")
      .eq("business_id", ctx.businessId)
      .eq("id", productId)
      .maybeSingle();
    if (!data || !data.active) return { found: false as const };
    const variant = variantId ? data.product_variants.find((v) => v.id === variantId) : undefined;
    const qty = variant ? variant.stock_quantity : data.stock_quantity;
    return { found: true as const, name: data.name, variant: variant ? `${variant.name}: ${variant.value}` : null, inStock: qty === null ? null : qty > 0, quantity: qty };
  },
});

export const getBusinessHours = tool({
  name: "getBusinessHours",
  description: "Weekly opening hours (business local time) and whether the business is open now.",
  input: z.object({}),
  async run(ctx) {
    const { data } = await ctx.db.from("businesses").select("timezone, opening_hours").eq("id", ctx.businessId).maybeSingle();
    if (!data) return null;
    const hours = parseOpeningHours(data.opening_hours);
    return { timezone: data.timezone, hours, openNow: isOpenAt(hours, data.timezone) };
  },
});

export const getDeliveryFee = tool({
  name: "getDeliveryFee",
  description:
    "Delivery information written by the business. There is no fee table yet: quote a fee only if the text states it for that area; otherwise hand over.",
  input: z.object({ area: z.string().trim().max(120).optional() }),
  async run(ctx) {
    const { data } = await ctx.db
      .from("knowledge_documents")
      .select("title, content")
      .eq("business_id", ctx.businessId)
      .eq("active", true)
      .eq("document_type", "delivery")
      .limit(5);
    return { fee: null, policies: (data ?? []).map((d) => ({ title: d.title, content: d.content.slice(0, 2000) })) };
  },
});

export const createCustomer = tool({
  name: "createCustomer",
  description:
    "Save details the customer shares about themselves (name, city) on their customer record. Their WhatsApp number is already known. Only save what the customer actually said.",
  input: z.object({ name: z.string().trim().min(1).max(120).optional(), city: z.string().trim().min(1).max(120).optional() }),
  async run(ctx, { name, city }) {
    if (ctx.dryRun) return { ok: true as const, testMode: "not saved" };
    if (!ctx.customerId) return { ok: false as const };
    const updates = { ...(name ? { name } : {}), ...(city ? { city } : {}) };
    if (!Object.keys(updates).length) return { ok: true as const };
    // Only fill in what the customer just shared; never blank out saved details.
    const { error } = await ctx.db.from("customers").update(updates).eq("id", ctx.customerId).eq("business_id", ctx.businessId);
    return { ok: !error };
  },
});

export const createOrder = tool({
  name: "createOrder",
  description: "Create an order for the current customer from catalog products. Prices come from the catalog. Only after the customer confirmed items and quantities.",
  input: z.object({
    items: z.array(z.object({ productId: z.uuid(), variantId: z.uuid().optional(), quantity: z.number().int().min(1).max(1000) })).min(1).max(30),
    deliveryAddress: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  async run(ctx, { items, deliveryAddress, notes }) {
    if (ctx.dryRun) return estimateOrder(ctx, items);
    if (!ctx.customerId) return { ok: false as const, reason: "no_customer" };
    const { data, error } = await ctx.db.rpc("create_order", {
      p_business_id: ctx.businessId,
      p_customer_id: ctx.customerId,
      p_items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId ?? null, quantity: i.quantity })),
      p_conversation_id: ctx.conversationId ?? undefined,
      p_delivery_address: deliveryAddress,
      p_notes: notes,
    });
    if (error || !data) return { ok: false as const, reason: "rejected" };
    const { data: order } = await ctx.db.from("orders").select("order_number, total, currency").eq("id", data).eq("business_id", ctx.businessId).single();
    return { ok: true as const, orderNumber: order?.order_number, total: Number(order?.total ?? 0), currency: order?.currency };
  },
});

export const getOrderStatus = tool({
  name: "getOrderStatus",
  description: "Status of one of THIS customer's orders, by order number (e.g. ORD-00012) or their latest order.",
  input: z.object({ orderNumber: z.string().trim().max(32).optional() }),
  async run(ctx, { orderNumber }) {
    if (!ctx.customerId) return { found: false as const };
    let q = ctx.db.from("orders").select("order_number, status, payment_status, total, currency, created_at").eq("business_id", ctx.businessId).eq("customer_id", ctx.customerId);
    if (orderNumber) q = q.eq("order_number", orderNumber.toUpperCase());
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? { found: true as const, ...data, total: Number(data.total) } : { found: false as const };
  },
});

export const requestHumanAgent = tool({
  name: "requestHumanAgent",
  description: "Hand the conversation to a person on the team (the AI stops replying until they return it).",
  input: z.object({ reason: z.string().trim().max(200) }),
  async run(ctx) {
    if (ctx.dryRun) return { ok: true as const, testMode: "not handed over" };
    if (!ctx.conversationId) return { ok: false as const };
    const { error } = await ctx.db
      .from("conversations")
      .update({ ai_enabled: false, human_requested: true, status: "pending" })
      .eq("business_id", ctx.businessId)
      .eq("id", ctx.conversationId);
    return { ok: !error };
  },
});

/** Test chat: what createOrder would record, priced from the catalog, without saving anything. */
async function estimateOrder(ctx: ToolContext, items: { productId: string; variantId?: string; quantity: number }[]) {
  const { data } = await ctx.db
    .from("products")
    .select("id, price, currency, active, product_variants(id, price_modifier)")
    .eq("business_id", ctx.businessId)
    .in("id", items.map((i) => i.productId));
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  let total = 0;
  let currency = "XAF";
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p || !p.active) return { ok: false as const, reason: "rejected" };
    const variant = item.variantId ? p.product_variants.find((v) => v.id === item.variantId) : null;
    if (item.variantId && !variant) return { ok: false as const, reason: "rejected" };
    total += Math.max(0, Number(p.price) + Number(variant?.price_modifier ?? 0)) * item.quantity;
    currency = p.currency;
  }
  return { ok: true as const, orderNumber: "TEST-00001", total, currency, testMode: "not saved" };
}

/** Everything the assistant may call, by name. */
export const TOOLS = {
  getBusinessInformation,
  searchProducts,
  checkProductStock,
  getBusinessHours,
  getDeliveryFee,
  createCustomer,
  createOrder,
  getOrderStatus,
  requestHumanAgent,
} as const;

export type ToolName = keyof typeof TOOLS;

/** Validates model-supplied arguments, then runs the tool for this business only. */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext) {
  const def = (TOOLS as Record<string, ToolDefinition<z.ZodType, unknown>>)[name];
  if (!def) return { error: "unknown_tool" as const };
  const parsed = def.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { error: "invalid_input" as const };
  return { result: await def.run(ctx, parsed.data) };
}

/** JSON Schema definitions to hand to the model, sorted by name so the prompt prefix stays cacheable. */
export function toolSchemas() {
  return Object.values(TOOLS)
    .map((t) => {
      const { $schema: _ignored, ...schema } = z.toJSONSchema(t.input) as Record<string, unknown>;
      void _ignored;
      return { name: t.name, description: t.description, input_schema: { type: "object" as const, ...schema } };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
