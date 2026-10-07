import "server-only";

import { META_PRICING } from "@/config/economics";
import { getUsageStatus } from "@/lib/billing/usage";
import { oneOf, CONVERSATION_STATUSES, ORDER_STATUSES, PAYMENT_STATUSES, WHATSAPP_STATUSES } from "@/types/database";
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";
import { createClient } from "@/lib/supabase/server";

/*
 * Read models for the dashboard. Every query runs with the signed-in user's
 * session, so Row Level Security limits results to their business; the
 * explicit business_id filters are defence in depth and help the planner.
 * Nothing here invents numbers: absent data is returned as 0 / null / [].
 */

export const PAGE_SIZE = 50;

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

/** PostgREST `or`/`ilike` patterns: strip characters that have meaning in the filter syntax. */
export function searchPattern(q: string | undefined | null): string | null {
  const cleaned = (q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 80);
  return cleaned ? `%${cleaned}%` : null;
}

// ---------------------------------------------------------------------------
// Dashboard home
// ---------------------------------------------------------------------------
export type DashboardMetrics = {
  conversations: number;
  newCustomers30d: number;
  orders: number;
  /** Share of resolved conversations answered by the AI without a person — null until there is data. */
  aiResolutionRate: number | null;
  humanHandovers: number;
  unreadConversations: number;
};

export async function getDashboardMetrics(businessId: string): Promise<DashboardMetrics> {
  const db = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [conversations, newCustomers30d, orders, humanHandovers, unreadConversations, resolved] = await Promise.all([
    count(db.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId)),
    count(db.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", since(30))),
    count(db.from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId)),
    count(
      db.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).or("ai_enabled.eq.false,human_requested.eq.true"),
    ),
    count(db.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).gt("unread_count", 0)),
    db.from("conversations").select("id, ai_enabled, human_requested").eq("business_id", businessId).eq("status", "resolved").limit(2000),
  ]);

  let aiResolutionRate: number | null = null;
  const resolvedRows = resolved.data ?? [];
  if (resolvedRows.length) {
    const { data: aiMessages } = await db
      .from("messages")
      .select("conversation_id")
      .eq("business_id", businessId)
      .eq("ai_generated", true)
      .in("conversation_id", resolvedRows.map((r) => r.id))
      .limit(5000);
    const answeredByAi = new Set((aiMessages ?? []).map((m) => m.conversation_id));
    const aiOnly = resolvedRows.filter((r) => r.ai_enabled && !r.human_requested && answeredByAi.has(r.id)).length;
    aiResolutionRate = answeredByAi.size ? aiOnly / resolvedRows.length : null;
  }
  return { conversations, newCustomers30d, orders, aiResolutionRate, humanHandovers, unreadConversations };
}

export type SetupProgress = {
  profile: boolean;
  hours: boolean;
  products: boolean;
  knowledge: boolean;
  aiConfigured: boolean;
  whatsapp: boolean;
};

export async function getSetupProgress(businessId: string, profileDone: boolean, hoursDone: boolean): Promise<SetupProgress> {
  const db = await createClient();
  const [products, faqs, docs, ai, wa] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    db.from("faqs").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    db.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    db.from("ai_settings").select("updated_at, created_at").eq("business_id", businessId).maybeSingle(),
    db.from("whatsapp_connections").select("status").eq("business_id", businessId).maybeSingle(),
  ]);
  return {
    profile: profileDone,
    hours: hoursDone,
    products: (products.count ?? 0) > 0,
    knowledge: (faqs.count ?? 0) + (docs.count ?? 0) > 0,
    aiConfigured: !!ai.data && ai.data.updated_at !== ai.data.created_at,
    whatsapp: wa.data?.status === "connected",
  };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export type ProductFilter = { q?: string; category?: string; status?: "active" | "inactive" | "all"; stock?: "low" | "out" | "all"; sort?: ProductSort; page?: number };
export const PRODUCT_SORTS = ["name", "newest", "priceHigh", "stockLow"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export async function listProducts(businessId: string, f: ProductFilter = {}) {
  const db = await createClient();
  let q = db
    .from("products")
    .select("id, name, category, sku, price, cost_price, unit, currency, stock_quantity, low_stock_threshold, image_url, active, updated_at, product_variants(count)", { count: "exact" })
    .eq("business_id", businessId);
  const pattern = searchPattern(f.q);
  if (pattern) q = q.or(`name.ilike.${pattern},sku.ilike.${pattern},category.ilike.${pattern}`);
  if (f.category) q = q.eq("category", f.category);
  if (f.status === "active") q = q.eq("active", true);
  if (f.status === "inactive") q = q.eq("active", false);
  if (f.stock === "out") q = q.eq("stock_quantity", 0);
  if (f.stock === "low") q = q.eq("stock_low", true);
  const page = Math.max(1, f.page ?? 1);
  if (f.sort === "newest") q = q.order("created_at", { ascending: false });
  else if (f.sort === "priceHigh") q = q.order("price", { ascending: false });
  else if (f.sort === "stockLow") q = q.order("stock_quantity", { ascending: true, nullsFirst: false });
  const { data, count } = await q.order("name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0, page };
}

export async function listProductCategories(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("products").select("category").eq("business_id", businessId).not("category", "is", null).limit(1000);
  return [...new Set((data ?? []).map((r) => r.category as string))].sort((a, b) => a.localeCompare(b));
}

export async function getProduct(businessId: string, id: string) {
  const db = await createClient();
  const { data } = await db
    .from("products")
    .select("*, product_variants(id, name, value, stock_quantity, price_modifier, sort_order)")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (data) data.product_variants.sort((a, b) => a.sort_order - b.sort_order);
  return data;
}

/** A product's stock history, newest first, with who made each change. */
export async function listStockMovements(businessId: string, productId: string, limit = 50) {
  const db = await createClient();
  const { data } = await db
    .from("stock_movements")
    .select("id, variant_id, reason, quantity_change, previous_stock, new_stock, order_id, note, created_by, created_at, product_variants(name, value), orders(order_number)")
    .eq("business_id", businessId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  const names = await userNames(rows.map((r) => r.created_by));
  return rows.map((r) => ({ ...r, by: r.created_by ? (names.get(r.created_by) ?? null) : null }));
}

/** Display names of team members (RLS: people who share a business with the viewer). */
export async function userNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, string>();
  const db = await createClient();
  const { data } = await db.from("users").select("id, full_name, email").in("id", unique);
  return new Map((data ?? []).map((u) => [u.id, u.full_name || u.email || ""]));
}

/** Active products with variants, for the order form. */
export async function listSellableProducts(businessId: string) {
  const db = await createClient();
  const { data } = await db
    .from("products")
    .select("id, name, price, currency, stock_quantity, product_variants(id, name, value, price_modifier, stock_quantity)")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name")
    .limit(500);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------
export async function listFaqs(businessId: string, q?: string) {
  const db = await createClient();
  let query = db.from("faqs").select("*").eq("business_id", businessId);
  const pattern = searchPattern(q);
  if (pattern) query = query.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
  const { data } = await query.order("priority", { ascending: false }).order("created_at").limit(500);
  return data ?? [];
}

export async function getFaq(businessId: string, id: string) {
  const db = await createClient();
  const { data } = await db.from("faqs").select("*").eq("business_id", businessId).eq("id", id).maybeSingle();
  return data;
}

export async function listDocuments(businessId: string, q?: string) {
  const db = await createClient();
  let query = db.from("knowledge_documents").select("id, title, document_type, active, updated_at, content").eq("business_id", businessId);
  const pattern = searchPattern(q);
  if (pattern) query = query.or(`title.ilike.${pattern},content.ilike.${pattern}`);
  const { data } = await query.order("document_type").order("title").limit(500);
  return data ?? [];
}

export async function getDocument(businessId: string, id: string) {
  const db = await createClient();
  const { data } = await db.from("knowledge_documents").select("*").eq("business_id", businessId).eq("id", id).maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export type CustomerStats = { orders_count: number; total_spent: number; amount_paid: number; outstanding: number; last_purchase_at: string | null };
const NO_STATS: CustomerStats = { orders_count: 0, total_spent: 0, amount_paid: 0, outstanding: 0, last_purchase_at: null };

function toStats(r: { orders_count: number | null; total_spent: number | null; amount_paid: number | null; outstanding: number | null; last_purchase_at: string | null } | null | undefined): CustomerStats {
  if (!r) return NO_STATS;
  return {
    orders_count: r.orders_count ?? 0,
    total_spent: Number(r.total_spent ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    outstanding: Number(r.outstanding ?? 0),
    last_purchase_at: r.last_purchase_at,
  };
}

export async function listCustomers(businessId: string, f: { q?: string; language?: string; tag?: string; balance?: boolean; page?: number } = {}) {
  const db = await createClient();
  const page = Math.max(1, f.page ?? 1);
  let owing: string[] | null = null;
  if (f.balance) {
    const { data } = await db.from("customer_stats").select("customer_id").eq("business_id", businessId).gt("outstanding", 0).limit(5000);
    owing = (data ?? []).map((r) => r.customer_id).filter((x): x is string => !!x);
    if (!owing.length) return { rows: [], total: 0, page };
  }
  let q = db
    .from("customers")
    .select("id, name, whatsapp_phone, preferred_language, city, tags, last_contact_at, created_at", { count: "exact" })
    .eq("business_id", businessId);
  const pattern = searchPattern(f.q);
  if (pattern) q = q.or(`name.ilike.${pattern},whatsapp_phone.ilike.${pattern},city.ilike.${pattern},email.ilike.${pattern}`);
  if (f.language && isLanguageCode(f.language)) q = q.eq("preferred_language", f.language);
  if (f.tag) q = q.contains("tags", [f.tag.toLowerCase()]);
  if (owing) q = q.in("id", owing);
  const { data, count } = await q
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = data ?? [];
  const stats = new Map<string, CustomerStats>();
  if (rows.length) {
    const { data: s } = await db
      .from("customer_stats")
      .select("customer_id, orders_count, total_spent, amount_paid, outstanding, last_purchase_at")
      .eq("business_id", businessId)
      .in(
        "customer_id",
        rows.map((r) => r.id),
      );
    for (const r of s ?? []) if (r.customer_id) stats.set(r.customer_id, toStats(r));
  }
  return { rows: rows.map((r) => ({ ...r, stats: stats.get(r.id) ?? NO_STATS })), total: count ?? 0, page };
}

export async function getCustomer(businessId: string, id: string) {
  const db = await createClient();
  const [customer, conversations, orders, stats, payments] = await Promise.all([
    db.from("customers").select("*").eq("business_id", businessId).eq("id", id).maybeSingle(),
    db
      .from("conversations")
      .select("id, status, ai_enabled, human_requested, last_message_at, created_at")
      .eq("business_id", businessId)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("orders")
      .select("id, order_number, status, channel, payment_status, total, amount_paid, currency, created_at")
      .eq("business_id", businessId)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("customer_stats").select("orders_count, total_spent, amount_paid, outstanding, last_purchase_at").eq("business_id", businessId).eq("customer_id", id).maybeSingle(),
    db
      .from("order_payments")
      .select("group_id, amount, method, reference, received_at, recorded_by")
      .eq("business_id", businessId)
      .eq("customer_id", id)
      .order("received_at", { ascending: false })
      .limit(200),
  ]);
  if (!customer.data) return null;
  // One payment the customer made can settle several purchases; show it once.
  const grouped = new Map<string, { id: string; amount: number; method: string; reference: string | null; received_at: string; recorded_by: string | null; orders: number }>();
  for (const p of payments.data ?? []) {
    const g = grouped.get(p.group_id);
    if (g) {
      g.amount += Number(p.amount);
      g.orders += 1;
    } else grouped.set(p.group_id, { id: p.group_id, amount: Number(p.amount), method: p.method, reference: p.reference, received_at: p.received_at, recorded_by: p.recorded_by, orders: 1 });
  }
  const list = [...grouped.values()];
  const names = await userNames(list.map((p) => p.recorded_by));
  return {
    customer: customer.data,
    conversations: conversations.data ?? [],
    orders: orders.data ?? [],
    stats: toStats(stats.data),
    payments: list.map((p) => ({ ...p, by: p.recorded_by ? (names.get(p.recorded_by) ?? null) : null })),
  };
}

export async function listCustomerOptions(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("customers").select("id, name, whatsapp_phone").eq("business_id", businessId).order("name").limit(1000);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export type ConversationFilter = { status?: string; mode?: "ai" | "human" | "unread"; q?: string };

export async function listConversations(businessId: string, f: ConversationFilter = {}) {
  const db = await createClient();
  let q = db
    .from("conversations")
    .select("id, status, ai_enabled, human_requested, unread_count, language, last_message_at, created_at, customers(id, name, whatsapp_phone)")
    .eq("business_id", businessId);
  if (f.status && (CONVERSATION_STATUSES as readonly string[]).includes(f.status)) q = q.eq("status", f.status);
  else q = q.neq("status", "archived");
  if (f.mode === "ai") q = q.eq("ai_enabled", true);
  if (f.mode === "human") q = q.eq("ai_enabled", false);
  if (f.mode === "unread") q = q.gt("unread_count", 0);
  const { data } = await q.order("last_message_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(200);
  let rows = data ?? [];
  const pattern = searchPattern(f.q)?.slice(1, -1).toLowerCase();
  if (pattern) {
    rows = rows.filter((r) => `${r.customers?.name ?? ""} ${r.customers?.whatsapp_phone ?? ""}`.toLowerCase().includes(pattern));
  }
  return rows;
}

export async function countConversations(businessId: string) {
  const db = await createClient();
  const { count } = await db.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  return count ?? 0;
}

export async function getConversation(businessId: string, id: string) {
  const db = await createClient();
  const [conversation, messages] = await Promise.all([
    db.from("conversations").select("*, customers(*)").eq("business_id", businessId).eq("id", id).maybeSingle(),
    db
      .from("messages")
      .select(
        "id, direction, sender_type, message_type, content, caption, payload, processing_status, language, ai_generated, delivery_status, delivery_error, created_at, message_media(id, kind, mime_type, is_voice, duration_seconds, original_filename, status, storage_path), message_transcriptions(status, transcript, language)",
      )
      .eq("business_id", businessId)
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (!conversation.data) return null;
  return { conversation: conversation.data, messages: messages.data ?? [] };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export async function listOrders(businessId: string, f: { status?: string; payment?: string; q?: string; page?: number } = {}) {
  const db = await createClient();
  let q = db
    .from("orders")
    .select("id, order_number, status, payment_status, total, currency, created_at, customers(id, name, whatsapp_phone)", { count: "exact" })
    .eq("business_id", businessId);
  if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) q = q.eq("status", f.status);
  if (f.payment && (PAYMENT_STATUSES as readonly string[]).includes(f.payment)) q = q.eq("payment_status", f.payment);
  const pattern = searchPattern(f.q);
  if (pattern) q = q.ilike("order_number", pattern);
  const page = Math.max(1, f.page ?? 1);
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0, page };
}

export async function getOrder(businessId: string, id: string) {
  const db = await createClient();
  const { data } = await db
    .from("orders")
    .select("*, customers(id, name, whatsapp_phone), order_items(id, product_id, product_name, variant, quantity, unit_price, total, unit_cost)")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Payments recorded for one order, oldest first, with who recorded them. */
export async function listOrderPayments(businessId: string, orderId: string) {
  const db = await createClient();
  const { data } = await db
    .from("order_payments")
    .select("id, amount, method, reference, received_at, recorded_by, provider")
    .eq("business_id", businessId)
    .eq("order_id", orderId)
    .order("received_at");
  const rows = data ?? [];
  const names = await userNames(rows.map((r) => r.recorded_by));
  return rows.map((r) => ({ ...r, by: r.recorded_by ? (names.get(r.recorded_by) ?? null) : null }));
}

// ---------------------------------------------------------------------------
// Sales (completed orders: POS sales and delivered orders)
// ---------------------------------------------------------------------------
/** Active products for the POS: price, stock, unit, photo and variants. */
export async function listPosProducts(businessId: string) {
  const db = await createClient();
  const { data } = await db
    .from("products")
    .select("id, name, sku, category, price, unit, stock_quantity, image_url, product_variants(id, name, value, price_modifier, stock_quantity, sort_order)")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name")
    .limit(1000);
  return (data ?? []).map((p) => ({ ...p, price: Number(p.price), product_variants: [...p.product_variants].sort((a, b) => a.sort_order - b.sort_order).map((v) => ({ ...v, price_modifier: Number(v.price_modifier) })) }));
}
export type PosProduct = Awaited<ReturnType<typeof listPosProducts>>[number];

export type SalesFilter = { q?: string; from?: string; to?: string; method?: string; status?: string; customer?: string; page?: number };

/** Completed sales, newest first, with items (for counts and profit), customer and staff. */
export async function listSales(businessId: string, timezone: string, f: SalesFilter = {}) {
  const db = await createClient();
  let q = db
    .from("orders")
    .select(
      "id, order_number, created_at, total, amount_paid, payment_status, payment_method, channel, created_by, customer_id, customers(id, name, whatsapp_phone), order_items(quantity, unit_cost)",
      { count: "exact" },
    )
    .eq("business_id", businessId)
    .eq("status", "delivered");
  if (f.q) q = q.ilike("order_number", `%${f.q.replace(/[%_,()*\\]/g, "").trim()}%`);
  if (f.customer) q = q.eq("customer_id", f.customer);
  if (f.method) q = q.eq("payment_method", f.method);
  if (f.status) q = q.eq("payment_status", f.status);
  if (f.from) q = q.gte("created_at", localDayStart(f.from, timezone));
  if (f.to) q = q.lt("created_at", localDayStart(f.to, timezone, 1));
  const page = Math.max(1, f.page ?? 1);
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = data ?? [];
  const names = await userNames(rows.map((r) => r.created_by));
  return {
    rows: rows.map((r) => {
      const costKnown = r.order_items.every((i) => i.unit_cost !== null);
      const cogs = r.order_items.reduce((s, i) => s + i.quantity * Number(i.unit_cost ?? 0), 0);
      return {
        ...r,
        items: r.order_items.reduce((s, i) => s + i.quantity, 0),
        profit: costKnown ? Number(r.total) - cogs : null,
        staff: r.created_by ? (names.get(r.created_by) ?? null) : null,
      };
    }),
    total: count ?? 0,
    page,
  };
}

/** "2026-10-07" (local date) → the UTC instant that day starts in the business's timezone (+ days). */
export function localDayStart(date: string, timezone: string, addDays = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, (m || 1) - 1, (d || 1) + addDays);
  // Offset of the timezone at that moment (e.g. Africa/Douala = +1h).
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asLocal - guess)).toISOString();
}

/** One sale with items, customer, payments and the people involved. */
export async function getSale(businessId: string, id: string) {
  const [order, payments] = await Promise.all([getOrder(businessId, id), listOrderPayments(businessId, id)]);
  if (!order) return null;
  const names = await userNames([order.created_by]);
  return { order, payments, staff: order.created_by ? (names.get(order.created_by) ?? null) : null };
}

// ---------------------------------------------------------------------------
// Settings, billing, WhatsApp, team
// ---------------------------------------------------------------------------
export async function getAiSettingsRow(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("ai_settings").select("*").eq("business_id", businessId).maybeSingle();
  return data;
}

export async function getWhatsAppConnection(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("whatsapp_connections").select("*").eq("business_id", businessId).maybeSingle();
  return data ? { ...data, status: oneOf(WHATSAPP_STATUSES, data.status, "not_connected") } : null;
}

export async function getBilling(businessId: string) {
  const db = await createClient();
  const [plans, subscription, usage, request, payments] = await Promise.all([
    db.from("plans").select("*").eq("active", true).order("sort_order"),
    db.from("subscriptions").select("*, plans(*)").eq("business_id", businessId).maybeSingle(),
    getUsageStatus(db, businessId),
    // Owners/admins only (RLS): the plan change waiting for the WazaBolt team.
    db.from("plan_change_requests").select("id, to_plan_id, created_at, contact_phone, billing_interval, kind").eq("business_id", businessId).eq("status", "pending").maybeSingle(),
    // Owners/admins only (RLS).
    db.from("subscription_payments").select("id, plan_id, billing_interval, amount, currency, reference, period_start, period_end, created_at").eq("business_id", businessId).order("created_at", { ascending: false }).limit(12),
  ]);
  return {
    plans: plans.data ?? [],
    subscription: subscription.data,
    usage,
    pendingRequest: request.data,
    payments: payments.data ?? [],
  };
}

export async function listTeam(businessId: string) {
  const db = await createClient();
  const { data: members } = await db.from("business_members").select("user_id, role, created_at").eq("business_id", businessId).order("created_at");
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("users").select("id, full_name, email, avatar_url").in("id", ids) : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return (members ?? []).map((m) => ({ ...m, profile: byId.get(m.user_id) ?? null }));
}

/** Pending invitations (owners/admins only — RLS returns nothing to other roles). */
export async function listPendingInvitations(businessId: string) {
  const db = await createClient();
  const { data } = await db
    .from("business_invitations")
    .select("id, email, role, created_at, expires_at")
    .eq("business_id", businessId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const now = Date.now();
  return (data ?? []).map((i) => ({ ...i, expired: new Date(i.expires_at).getTime() < now }));
}

// ---------------------------------------------------------------------------
// Analytics (real data only; empty when nothing has happened yet)
// ---------------------------------------------------------------------------
export type Analytics = {
  totals: DashboardMetrics & { customers: number; revenue: number; currency: string };
  conversationsByStatus: Record<string, number>;
  ordersByStatus: Record<string, number>;
  topOrderedProducts: { name: string; quantity: number }[];
  customerLanguages: { language: LanguageCode | "unknown"; count: number }[];
  messageLanguages: { language: LanguageCode; count: number }[];
};

export async function getAnalytics(businessId: string, currency: string): Promise<Analytics> {
  const db = await createClient();
  const [metrics, customers, conv, orders, items, custLangs, msgLangs] = await Promise.all([
    getDashboardMetrics(businessId),
    db.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    db.from("conversations").select("status").eq("business_id", businessId).limit(10000),
    db.from("orders").select("status, total").eq("business_id", businessId).limit(10000),
    db.from("order_items").select("product_name, quantity, orders!inner(status)").eq("business_id", businessId).neq("orders.status", "cancelled").limit(10000),
    db.from("customers").select("preferred_language").eq("business_id", businessId).limit(10000),
    db.from("messages").select("language").eq("business_id", businessId).eq("direction", "inbound").not("language", "is", null).limit(10000),
  ]);

  const tally = <T extends string>(values: T[]) => values.reduce<Record<string, number>>((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {});
  const products = new Map<string, number>();
  for (const i of items.data ?? []) products.set(i.product_name, (products.get(i.product_name) ?? 0) + i.quantity);
  const custLang = tally((custLangs.data ?? []).map((c) => (c.preferred_language && isLanguageCode(c.preferred_language) ? c.preferred_language : "unknown")));
  const msgLang = tally((msgLangs.data ?? []).map((m) => m.language as string).filter(isLanguageCode));

  return {
    totals: {
      ...metrics,
      customers: customers.count ?? 0,
      revenue: (orders.data ?? []).filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0),
      currency,
    },
    conversationsByStatus: tally((conv.data ?? []).map((c) => c.status)),
    ordersByStatus: tally((orders.data ?? []).map((o) => o.status)),
    topOrderedProducts: [...products.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    customerLanguages: Object.entries(custLang).map(([language, count]) => ({ language: language as LanguageCode | "unknown", count })).sort((a, b) => b.count - a.count),
    messageLanguages: Object.entries(msgLang).map(([language, count]) => ({ language: language as LanguageCode, count })).sort((a, b) => b.count - a.count),
  };
}

/** This month's AI outcomes (owners/admins only — RLS hides ai_usage from other roles). */
export async function getAiUsageSummary(businessId: string) {
  const db = await createClient();
  const { data } = await db
    .from("ai_usage")
    .select("outcome")
    .eq("business_id", businessId)
    .gte("created_at", monthStart())
    .or("reason.is.null,reason.neq.test_chat") // test-chat runs aren't customer conversations
    .limit(20000);
  const rows = data ?? [];
  return {
    replies: rows.filter((r) => r.outcome === "replied").length,
    handovers: rows.filter((r) => r.outcome === "handed_over").length,
    failed: rows.filter((r) => r.outcome === "failed").length,
  };
}

// ---------------------------------------------------------------------------
// Stock alerts (Stage 4)
// ---------------------------------------------------------------------------
export type StockAlert = { productId: string; name: string; variant: string | null; quantity: number; out: boolean };

/** Active products (or tracked variants) out of stock or at/below their low-stock threshold, most urgent first. */
/**
 * Free WhatsApp service messages left this month for the connected number
 * (null when no number is connected). Counts only — never prices.
 */
export async function getFreeWhatsAppMessages(businessId: string) {
  const db = await createClient();
  const { data } = await db.rpc("whatsapp_free_usage", { p_business_id: businessId }).maybeSingle();
  if (!data) return null;
  const total = META_PRICING.freeServicePerNumberPerMonth;
  const [y, m] = data.month.split("-").map(Number);
  return { used: data.service_sent, total, left: Math.max(0, total - data.service_sent), resetsOn: new Date(Date.UTC(y, m, 1)).toISOString() };
}

export async function getStockAlerts(businessId: string, max = 8): Promise<{ alerts: StockAlert[]; total: number }> {
  const db = await createClient();
  const { data } = await db
    .from("products")
    .select("id, name, stock_quantity, low_stock_threshold, product_variants(name, value, stock_quantity)")
    .eq("business_id", businessId)
    .eq("active", true)
    .limit(2000);
  const alerts: StockAlert[] = [];
  for (const p of data ?? []) {
    const tracked = p.product_variants.filter((v) => v.stock_quantity !== null);
    for (const v of tracked) {
      if (v.stock_quantity! <= p.low_stock_threshold) {
        alerts.push({ productId: p.id, name: p.name, variant: `${v.name}: ${v.value}`, quantity: v.stock_quantity!, out: v.stock_quantity === 0 });
      }
    }
    if (p.stock_quantity !== null && p.stock_quantity <= p.low_stock_threshold) {
      alerts.push({ productId: p.id, name: p.name, variant: null, quantity: p.stock_quantity, out: p.stock_quantity === 0 });
    }
  }
  alerts.sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
  return { alerts: alerts.slice(0, max), total: alerts.length };
}

// ---------------------------------------------------------------------------
// Appointments (Stage 6)
// ---------------------------------------------------------------------------
export async function getBookingSetup(businessId: string) {
  const db = await createClient();
  const [settings, services] = await Promise.all([
    db.from("booking_settings").select("*").eq("business_id", businessId).maybeSingle(),
    db.from("services").select("*").eq("business_id", businessId).order("sort_order").order("name"),
  ]);
  return { settings: settings.data, services: services.data ?? [] };
}

/** Appointments starting in [from, to), with the customer's name, earliest first. */
export async function listAppointments(businessId: string, fromIso: string, toIso: string, limit = 500) {
  const db = await createClient();
  const { data } = await db
    .from("appointments")
    .select("id, service_name, price, currency, starts_at, ends_at, status, notes, customer_id, conversation_id, customers(name, whatsapp_phone)")
    .eq("business_id", businessId)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at")
    .limit(limit);
  return data ?? [];
}

/** Calendar windows: the next 30 days, or the past 30 days (most recent first). */
export async function listAppointmentWindow(businessId: string, view: "upcoming" | "past") {
  const now = Date.now();
  const day = 86_400_000;
  const rows =
    view === "past"
      ? (await listAppointments(businessId, new Date(now - 30 * day).toISOString(), new Date(now).toISOString())).reverse()
      : // Include the last day too: earlier appointments still to be marked done / no-show.
        await listAppointments(businessId, new Date(now - day).toISOString(), new Date(now + 30 * day).toISOString());
  return rows.map((r) => ({ ...r, ended: new Date(r.ends_at).getTime() <= now }));
}

/** The next few active appointments (dashboard home). */
export async function listNextAppointments(businessId: string, max = 5) {
  const db = await createClient();
  const { data } = await db
    .from("appointments")
    .select("id, service_name, starts_at, status, customers(name, whatsapp_phone)")
    .eq("business_id", businessId)
    .in("status", ["booked", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(max);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Customer notifications (Stage 7)
// ---------------------------------------------------------------------------
export async function getNotificationSetup(businessId: string) {
  const db = await createClient();
  const [settings, templates, log] = await Promise.all([
    db.from("notification_settings").select("*").eq("business_id", businessId).maybeSingle(),
    db.from("whatsapp_templates").select("id, kind, language, status, rejected_reason, updated_at").eq("business_id", businessId),
    db
      .from("notifications")
      .select("id, kind, status, channel, reason, created_at, customer_id, order_id, appointment_id, customers(name, whatsapp_phone)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return { settings: settings.data, templates: templates.data ?? [], log: log.data ?? [] };
}

export async function listOrderNotifications(businessId: string, orderId: string) {
  const db = await createClient();
  const { data } = await db.from("notifications").select("id, kind, status, channel, reason, created_at").eq("business_id", businessId).eq("order_id", orderId).order("created_at");
  return data ?? [];
}

/** Is the follow-up template approved in any language? */
export async function followUpReady(businessId: string) {
  const db = await createClient();
  const { count } = await db.from("whatsapp_templates").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("kind", "follow_up").eq("status", "approved");
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Broadcasts (Stage 8)
// ---------------------------------------------------------------------------
export async function listBroadcasts(businessId: string) {
  const db = await createClient();
  const { data } = await db
    .from("broadcasts")
    .select("id, name, language, status, template_status, recipients_count, sent_count, failed_count, created_at, finished_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getBroadcast(businessId: string, id: string) {
  const db = await createClient();
  const [broadcast, recipients] = await Promise.all([
    db.from("broadcasts").select("*").eq("business_id", businessId).eq("id", id).maybeSingle(),
    db
      .from("broadcast_recipients")
      .select("id, status, error, sent_at, customer_id, customers(name, whatsapp_phone)")
      .eq("business_id", businessId)
      .eq("broadcast_id", id)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(100),
  ]);
  return broadcast.data ? { ...broadcast.data, recipients: recipients.data ?? [] } : null;
}

/** Opted-in customers (with a number) matching tags (any) and language. */
export async function countAudience(businessId: string, tags: string[], language: string | null) {
  const db = await createClient();
  let q = db.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("marketing_opt_in", true).neq("whatsapp_phone", "");
  if (tags.length) q = q.overlaps("tags", tags);
  if (language) q = q.eq("preferred_language", language);
  const { count } = await q;
  return count ?? 0;
}

/** Every tag used on the business's customers, most used first. */
export async function listCustomerTags(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("customers").select("tags").eq("business_id", businessId).limit(5000);
  const counts = new Map<string, number>();
  for (const c of data ?? []) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}
