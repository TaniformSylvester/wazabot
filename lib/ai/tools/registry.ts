import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";
import { CATALOG_PHOTO_EDGE, MAX_IMAGE_INPUT_BYTES, prepareImage, type InputImage } from "@/lib/ai/images";
import { isOpenAt, parseOpeningHours } from "@/lib/business/hours";
import { LOCAL_DATE, LOCAL_STAMP, localDate, localStamp, localTime, localWeekday } from "@/lib/business/time";
import { availableValues, colourOf, findVariant, parseCombination, parseOptions, usesOptions, variantAvailable, variantLabel, type Combination, type ProductOption } from "@/lib/products/options";

import { searchWords } from "./search-words";
import { resolveModules } from "@/lib/modules";
import { linePrice, parseExtras, type Extra } from "@/lib/restaurant/extras";

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
  description: "Business name, description, address, phone, website and whether it is open now; with several branches, each branch's address, phone and hours.",
  input: z.object({}),
  async run(ctx) {
    const [{ data }, branches] = await Promise.all([
      ctx.db.from("businesses").select("name, description, city, address, phone, website, timezone, opening_hours").eq("id", ctx.businessId).maybeSingle(),
      openBranches(ctx),
    ]);
    if (!data) return null;
    return {
      ...(branches.length > 1 ? { branches: branches.map((b) => ({ branchId: b.id, name: b.name, address: b.address, city: b.city, phone: b.phone, hours: b.hours })) } : {}),
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
  description:
    "Search active products by words in the name, category, description or SKU (any word may match; best matches first). " +
    "For a customer's photo, search with words describing it (type, colour, pattern, material). Only facts returned here may be told to customers. " +
    "Products sold in combinations (e.g. colour × size) list their options with the values in stock; call checkProductOptions for what is available in a given colour or size, the exact price and the variantId.",
  input: z.object({ query: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(10).default(5) }),
  async run(ctx, { query, limit }) {
    const words = searchWords(query);
    if (!words.length) return [];
    const { data } = await ctx.db
      .from("products")
      .select("id, name, description, category, sku, price, currency, stock_quantity, image_url, options, extras, product_variants(id, name, value, options, price_modifier, stock_quantity, sort_order)")
      .eq("business_id", ctx.businessId)
      .eq("active", true)
      .or(words.flatMap((w) => [`name.ilike.%${w}%`, `category.ilike.%${w}%`, `description.ilike.%${w}%`, `sku.ilike.%${w}%`]).join(","))
      .limit(40);
    // Rank: words found in the name count most, then category, then description/SKU.
    const score = (p: NonNullable<typeof data>[number]) =>
      words.reduce((sum, w) => {
        if (p.name.toLowerCase().includes(w)) return sum + 3;
        if (p.category?.toLowerCase().includes(w)) return sum + 2;
        if (p.description?.toLowerCase().includes(w) || p.sku?.toLowerCase().includes(w)) return sum + 1;
        return sum;
      }, 0);
    return (data ?? [])
      .map((p) => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
      .slice(0, limit)
      .map(({ p }) => {
        const options = parseOptions(p.options);
        const variants = [...p.product_variants].sort((a, b) => a.sort_order - b.sort_order);
        const combos = usesOptions(options, variants);
        return {
          productId: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          price: Number(p.price),
          currency: p.currency,
          inStock: combos ? variants.some((v) => variantAvailable(v, p.stock_quantity)) : p.stock_quantity === null ? null : p.stock_quantity > 0,
          hasPhoto: catalogPhotoUrl(p.image_url) !== null,
          ...(parseExtras(p.extras).length ? { extras: parseExtras(p.extras) } : {}),
          ...(combos ? { options: optionSummary(options, variants, p.stock_quantity), ...(variants.some((v) => Number(v.price_modifier) !== 0) ? { pricesVary: true } : {}) } : {}),
          variants: combos
            ? []
            : variants.map((v) => ({
                variantId: v.id,
                label: `${v.name}: ${v.value}`,
                price: Math.max(0, Number(p.price) + Number(v.price_modifier)),
                inStock: v.stock_quantity === null ? null : v.stock_quantity > 0,
              })),
        };
      });
  },
});

type OptionSummary = { name: string; values: string[]; soldOut?: string[]; withPhoto?: string[] };

/** Each option with the values that are in stock in at least one combination (and, for colours, which have their own photo). */
function optionSummary(options: ProductOption[], variants: { options: unknown; stock_quantity: number | null; price_modifier: number }[], productStock: number | null): OptionSummary[] {
  const rows = variants.map((v) => ({ ...v, id: "", price_modifier: Number(v.price_modifier) }));
  const available = availableValues(options, rows, productStock, {});
  return options.map((o) => {
    const inStock = o.values.filter((v) => available[o.name]?.has(v.value)).map((v) => v.value);
    const soldOut = o.values.filter((v) => !available[o.name]?.has(v.value)).map((v) => v.value);
    const withPhoto = o.colour ? o.values.filter((v) => catalogPhotoUrl(v.image_url)).map((v) => v.value) : [];
    return { name: o.name, values: inStock, ...(soldOut.length ? { soldOut } : {}), ...(withPhoto.length ? { withPhoto } : {}) };
  });
}

/** The customer's words ("red", "m") → the product's own option names and values, case-insensitively. */
function matchChoice(options: ProductOption[], choose: Record<string, string>) {
  const chosen: Combination = {};
  const unknown: string[] = [];
  for (const [k, v] of Object.entries(choose)) {
    const o = options.find((x) => x.name.toLowerCase() === k.trim().toLowerCase());
    const value = o?.values.find((x) => x.value.toLowerCase() === v.trim().toLowerCase());
    if (o && value) chosen[o.name] = value.value;
    else unknown.push(`${k}: ${v}`);
  }
  return { chosen, unknown };
}

export const checkProductOptions = tool({
  name: "checkProductOptions",
  description:
    "For a product sold in combinations (options listed by searchProducts): which values are in stock given what the customer chose, " +
    "e.g. choose {\"Size\": \"M\"} → the colours available in M. When every option is chosen, returns the exact combination: variantId (for createOrder), price and stock. " +
    "Use the option names and values exactly as listed.",
  input: z.object({ productId: z.uuid(), choose: z.record(z.string().max(40), z.string().max(40)).optional() }),
  async run(ctx, { productId, choose }) {
    const { data } = await ctx.db
      .from("products")
      .select("name, active, price, currency, stock_quantity, image_url, options, product_variants(id, name, value, options, price_modifier, stock_quantity)")
      .eq("business_id", ctx.businessId)
      .eq("id", productId)
      .maybeSingle();
    if (!data || !data.active) return { found: false as const };
    const options = parseOptions(data.options);
    const variants = data.product_variants.map((v) => ({ ...v, price_modifier: Number(v.price_modifier) }));
    if (!usesOptions(options, variants)) return { found: true as const, name: data.name, hasOptions: false as const };
    const { chosen, unknown } = matchChoice(options, choose ?? {});
    const available = availableValues(options, variants, data.stock_quantity, chosen);
    const match = findVariant(options, variants, chosen);
    const colour = colourOf(chosen, options);
    return {
      found: true as const,
      name: data.name,
      ...(unknown.length ? { unknown } : {}),
      options: options.map((o) => ({ name: o.name, ...(chosen[o.name] ? { chosen: chosen[o.name] } : {}), available: o.values.filter((v) => available[o.name]?.has(v.value)).map((v) => v.value) })),
      combination: match
        ? {
            variantId: match.id,
            label: variantLabel(match, options),
            price: Math.max(0, Number(data.price) + match.price_modifier),
            currency: data.currency,
            inStock: variantAvailable(match, data.stock_quantity),
            quantity: match.stock_quantity ?? data.stock_quantity,
            hasPhoto: catalogPhotoUrl(colour?.image_url) !== null || catalogPhotoUrl(data.image_url) !== null,
          }
        : null,
    };
  },
});

/**
 * Only photos uploaded to WazaBolt's own product-images storage are fetched
 * (never an arbitrary URL typed into a product).
 */
export function catalogPhotoUrl(url: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !base) return null;
  return url.startsWith(`${base.replace(/\/$/, "")}/storage/v1/object/public/product-images/`) ? url : null;
}

/**
 * The photo to send for send_photo: the colour's own photo, or the product's
 * main photo when no colour was named. A colour without its own photo gives
 * none (the main photo may show another colour).
 */
export async function resolveCatalogPhoto(db: SupabaseClient<Database>, businessId: string, photo: { product_id: string; colour: string | null }) {
  const { data } = await db.from("products").select("name, image_url, options, active").eq("business_id", businessId).eq("id", photo.product_id).maybeSingle();
  if (!data?.active) return null;
  const wanted = photo.colour?.trim().toLowerCase();
  const colour = wanted ? (parseOptions(data.options).find((o) => o.colour)?.values.find((v) => v.value.toLowerCase() === wanted) ?? null) : null;
  const url = wanted ? catalogPhotoUrl(colour?.image_url) : catalogPhotoUrl(data.image_url);
  return url ? { url, caption: colour ? `${data.name} — ${colour.value}` : data.name } : null;
}

/** A catalog photo the model can look at (converted to an image block by the responder). */
export type ProductPhoto = { productId: string; name: string; image: InputImage };

export const viewProductPhotos = tool({
  name: "viewProductPhotos",
  description:
    "Look at the catalog photos of up to 2 products (ids from searchProducts with hasPhoto true), e.g. to compare them with a photo the customer sent. " +
    "Returns the photos as images.",
  input: z.object({ productIds: z.array(z.uuid()).min(1).max(2) }),
  async run(ctx, { productIds }) {
    const { data } = await ctx.db.from("products").select("id, name, image_url, active").eq("business_id", ctx.businessId).in("id", productIds);
    const photos: ProductPhoto[] = [];
    const withoutPhoto: string[] = [];
    for (const p of data ?? []) {
      const url = p.active ? catalogPhotoUrl(p.image_url) : null;
      const image = url ? await fetchCatalogPhoto(url) : null;
      if (image) photos.push({ productId: p.id, name: p.name, image });
      else withoutPhoto.push(p.id);
    }
    return { photos, withoutPhoto };
  },
});

async function fetchCatalogPhoto(url: string): Promise<InputImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_INPUT_BYTES) return null;
    return await prepareImage(new Uint8Array(await res.arrayBuffer()), CATALOG_PHOTO_EDGE);
  } catch {
    return null;
  }
}

export const checkProductStock = tool({
  name: "checkProductStock",
  description: "Current stock for one product (and optionally one variant). inStock is null when stock isn't tracked. With several branches, byBranch gives each branch's quantity (quantity is the total).",
  input: z.object({ productId: z.uuid(), variantId: z.uuid().optional() }),
  async run(ctx, { productId, variantId }) {
    const [{ data }, branches] = await Promise.all([
      ctx.db
        .from("products")
        .select("name, active, stock_quantity, options, product_variants(id, name, value, options, stock_quantity)")
        .eq("business_id", ctx.businessId)
        .eq("id", productId)
        .maybeSingle(),
      openBranches(ctx),
    ]);
    if (!data || !data.active) return { found: false as const };
    const variant = variantId ? data.product_variants.find((v) => v.id === variantId) : undefined;
    const qty = variant ? variant.stock_quantity : data.stock_quantity;
    let byBranch: { branch: string; branchId: string; quantity: number }[] | undefined;
    if (qty !== null && branches.length > 1) {
      // The same rule as the totals: a tracked variant's stock, otherwise the product's.
      let q = ctx.db.from("branch_stock").select("branch_id, quantity").eq("business_id", ctx.businessId).eq("product_id", productId);
      q = variant ? q.eq("variant_id", variant.id) : q.is("variant_id", null);
      const { data: rows } = await q;
      byBranch = branches.map((b) => ({ branch: b.name, branchId: b.id, quantity: rows?.find((r) => r.branch_id === b.id)?.quantity ?? 0 }));
    }
    return { found: true as const, name: data.name, variant: variant ? variantLabel(variant, data.options) : null, inStock: qty === null ? null : qty > 0, quantity: qty, ...(byBranch ? { byBranch } : {}) };
  },
});

/** Open branches of the business (the main one first). */
async function openBranches(ctx: ToolContext) {
  const { data } = await ctx.db
    .from("branches")
    .select("id, name, address, city, phone, hours")
    .eq("business_id", ctx.businessId)
    .eq("active", true)
    .order("is_main", { ascending: false })
    .order("created_at");
  return data ?? [];
}

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
  description:
    "Create an order for the current customer from catalog products. Prices come from the catalog. Only after the customer confirmed items and quantities. " +
    "Fails with reason out_of_stock (and the item) when there isn't enough stock: tell the customer and offer what is available. " +
    "A product sold in combinations needs the variantId of the exact combination (checkProductOptions); without it the order fails with choose_options. " +
    "Restaurants: a dish's extras (by name, from searchProducts) and a short note for the kitchen per item, and serviceType takeaway or delivery (delivery needs the address); the team checks the order before the kitchen starts. " +
    "With several branches, branchId is the branch the order is from (ask the customer); without it the order fails with choose_branch and the list of branches.",
  input: z.object({
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          variantId: z.uuid().optional(),
          quantity: z.number().int().min(1).max(1000),
          extras: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
          note: z.string().trim().max(200).optional(),
        }),
      )
      .min(1)
      .max(30),
    deliveryAddress: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
    serviceType: z.enum(["takeaway", "delivery"]).optional(),
    branchId: z.uuid().optional(),
  }),
  async run(ctx, { items, deliveryAddress, notes, serviceType, branchId }) {
    // Several branches: the order needs to say which one (stock and the team are per branch).
    const branches = await openBranches(ctx);
    if (branches.length > 1 && !branches.some((b) => b.id === branchId)) {
      return { ok: false as const, reason: "choose_branch", branches: branches.map((b) => ({ branchId: b.id, name: b.name, address: [b.address, b.city].filter(Boolean).join(", ") || null })) };
    }
    const branch = branches.length > 1 ? branchId : undefined;
    if (ctx.dryRun) return estimateOrder(ctx, items);
    if (!ctx.customerId) return { ok: false as const, reason: "no_customer" };
    if (await usesRestaurant(ctx)) return restaurantOrder(ctx, items, serviceType ?? (deliveryAddress ? "delivery" : "takeaway"), deliveryAddress, notes, branch);
    const { data, error } = await ctx.db.rpc("create_order", {
      p_business_id: ctx.businessId,
      p_customer_id: ctx.customerId,
      p_items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId ?? null, quantity: i.quantity })),
      p_conversation_id: ctx.conversationId ?? undefined,
      p_delivery_address: deliveryAddress,
      p_notes: notes,
      p_branch_id: branch,
    });
    if (error?.code === "WB409") {
      return { ok: false as const, reason: "out_of_stock", item: error.message.replace(/^insufficient stock:\s*/, "").slice(0, 200) };
    }
    if (error?.message?.startsWith("choose options")) return { ok: false as const, reason: "choose_options", item: error.message.replace(/^choose options for\s*/, "").slice(0, 200) };
    if (error || !data) return { ok: false as const, reason: "rejected" };
    const { data: order } = await ctx.db.from("orders").select("order_number, total, currency").eq("id", data).eq("business_id", ctx.businessId).single();
    return { ok: true as const, orderNumber: order?.order_number, total: Number(order?.total ?? 0), currency: order?.currency };
  },
});

/** The business uses the Restaurant module (its choice, or the default for its industry). */
async function usesRestaurant(ctx: ToolContext) {
  const [{ data: biz }, { data: rows }] = await Promise.all([
    ctx.db.from("businesses").select("industry").eq("id", ctx.businessId).maybeSingle(),
    ctx.db.from("business_modules").select("module, enabled").eq("business_id", ctx.businessId),
  ]);
  return resolveModules(biz?.industry ?? null, rows ?? []).includes("restaurant");
}

/** A restaurant order from WhatsApp: takeaway or delivery, extras and notes; it waits for the team before the kitchen. */
async function restaurantOrder(
  ctx: ToolContext,
  items: { productId: string; variantId?: string; quantity: number; extras?: string[]; note?: string }[],
  serviceType: "takeaway" | "delivery",
  address: string | undefined,
  notes: string | undefined,
  branchId?: string,
) {
  if (serviceType === "delivery" && !address) return { ok: false as const, reason: "address_needed" };
  const { data, error } = await ctx.db.rpc("restaurant_open_order", {
    p_business_id: ctx.businessId,
    p_service_type: serviceType,
    p_items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId ?? null, quantity: i.quantity, extras: i.extras ?? [], note: i.note })),
    p_customer_id: ctx.customerId ?? undefined,
    p_notes: notes,
    p_delivery: serviceType === "delivery" ? { address } : undefined,
    p_conversation_id: ctx.conversationId ?? undefined,
    p_branch_id: branchId,
  });
  if (error?.code === "WB409") return { ok: false as const, reason: "out_of_stock", item: error.message.replace(/^insufficient stock:\s*/, "").slice(0, 200) };
  if (error?.message?.startsWith("unknown extra")) return { ok: false as const, reason: "unknown_extra", item: error.message.replace(/^unknown extra for\s*/, "").slice(0, 200) };
  if (error?.message?.startsWith("choose options")) return { ok: false as const, reason: "choose_options", item: error.message.replace(/^choose options for\s*/, "").slice(0, 200) };
  if (error || !data) return { ok: false as const, reason: "rejected" };
  const { data: order } = await ctx.db.from("orders").select("order_number, total, currency").eq("id", data).eq("business_id", ctx.businessId).single();
  return { ok: true as const, orderNumber: order?.order_number, total: Number(order?.total ?? 0), currency: order?.currency, serviceType, waitsForTeam: true };
}

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

// ---------------------------------------------------------------------------
// Documents (Phase 4): the customer's own issued invoices and receipts. The
// assistant only lists them; the documents it names in send_documents are
// rendered by the documents engine and sent after its reply. It never
// creates or changes a document.
// ---------------------------------------------------------------------------
/** Documents the assistant may send: issued invoices and payment receipts (not drafts, voided documents or quotations). */
export const SENDABLE_DOC_TYPES = ["invoice", "receipt"] as const;
export const SENDABLE_DOC_STATUSES = ["issued", "partially_paid", "paid"] as const;

export const findMyDocuments = tool({
  name: "findMyDocuments",
  description:
    "THIS customer's invoices and payment receipts that the business has already issued (newest first), optionally for one order (e.g. ORD-00012) or one document number (e.g. INV-2026-000004). " +
    "To send some, put their documentId in send_documents: the PDFs are sent right after your message. " +
    "Nothing found: never invent one — say the team will prepare it (the team is notified automatically).",
  input: z.object({
    type: z.enum(["invoice", "receipt", "any"]).default("any"),
    orderNumber: z.string().trim().max(32).optional(),
    documentNumber: z.string().trim().max(40).optional(),
  }),
  async run(ctx, { type, orderNumber, documentNumber }) {
    if (!ctx.customerId) return { found: false as const };
    let orderId: string | null = null;
    if (orderNumber) {
      const { data: order } = await ctx.db
        .from("orders")
        .select("id")
        .eq("business_id", ctx.businessId)
        .eq("customer_id", ctx.customerId)
        .eq("order_number", orderNumber.toUpperCase())
        .maybeSingle();
      if (!order) return { found: false as const, reason: "order_not_found" };
      orderId = order.id;
    }
    let q = ctx.db
      .from("documents")
      .select("id, doc_type, number, status, issue_date, total, amount_paid, currency, order_id, invoice_id, orders(order_number)")
      .eq("business_id", ctx.businessId)
      .eq("customer_id", ctx.customerId)
      .in("doc_type", type === "any" ? [...SENDABLE_DOC_TYPES] : [type])
      .in("status", [...SENDABLE_DOC_STATUSES]);
    if (documentNumber) q = q.eq("number", documentNumber.toUpperCase());
    if (orderId) q = q.eq("order_id", orderId);
    const { data } = await q.order("issued_at", { ascending: false, nullsFirst: false }).limit(5);
    const documents = (data ?? []).map((d) => ({
      documentId: d.id,
      type: d.doc_type,
      number: d.number,
      status: d.status,
      issueDate: d.issue_date,
      total: Number(d.total),
      ...(d.doc_type === "receipt" ? { amountReceived: Number(d.amount_paid ?? d.total) } : {}),
      currency: d.currency,
      orderNumber: d.orders?.order_number ?? null,
    }));
    if (documents.length) return { found: true as const, documents };
    // Nothing to send: a person on the team prepares it (the assistant keeps answering).
    if (!ctx.dryRun && ctx.conversationId) {
      await ctx.db.from("conversations").update({ human_requested: true }).eq("business_id", ctx.businessId).eq("id", ctx.conversationId);
    }
    return { found: false as const, teamNotified: !ctx.dryRun };
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

// ---------------------------------------------------------------------------
// Appointments (Stage 6). Times go to and from the model as local
// "YYYY-MM-DDTHH:mm"; a booking must match one of the real free slots.
// ---------------------------------------------------------------------------
async function businessTimezone(ctx: ToolContext) {
  const { data } = await ctx.db.from("businesses").select("timezone").eq("id", ctx.businessId).maybeSingle();
  return data?.timezone ?? "Africa/Douala";
}

async function freeSlots(ctx: ToolContext, serviceId: string, from: string | undefined, days: number) {
  const { data, error } = await ctx.db.rpc("available_slots", { p_business_id: ctx.businessId, p_service_id: serviceId, p_from: from, p_days: days });
  return error ? [] : (data ?? []);
}

export const findAvailableSlots = tool({
  name: "findAvailableSlots",
  description:
    "Free appointment times for a service (serviceId from the business information), from a day (YYYY-MM-DD, business local date; default today) for 1–7 days. " +
    "Times are local, grouped by day. An empty list means nothing is free in that period.",
  input: z.object({ serviceId: z.uuid(), date: z.string().regex(LOCAL_DATE).optional(), days: z.number().int().min(1).max(7).default(3) }),
  async run(ctx, { serviceId, date, days }) {
    const tz = await businessTimezone(ctx);
    const slots = await freeSlots(ctx, serviceId, date, days);
    const byDay = new Map<string, { date: string; weekday: string; times: string[] }>();
    for (const s of slots) {
      const at = new Date(s.starts_at);
      const day = localDate(at, tz);
      if (!byDay.has(day)) byDay.set(day, { date: day, weekday: localWeekday(at, tz), times: [] });
      byDay.get(day)!.times.push(localTime(at, tz));
    }
    return { timezone: tz, days: [...byDay.values()] };
  },
});

export const bookAppointment = tool({
  name: "bookAppointment",
  description:
    "Book an appointment for the current customer: a service and one of the free times from findAvailableSlots (startsAt local YYYY-MM-DDTHH:mm). " +
    "Only after the customer confirmed the service, day and time. Fails with not_available if that time was taken meanwhile.",
  input: z.object({ serviceId: z.uuid(), startsAt: z.string().regex(LOCAL_STAMP), notes: z.string().trim().max(500).optional() }),
  async run(ctx, { serviceId, startsAt, notes }) {
    const tz = await businessTimezone(ctx);
    const slot = (await freeSlots(ctx, serviceId, startsAt.slice(0, 10), 1)).find((s) => localStamp(new Date(s.starts_at), tz) === startsAt);
    if (!slot) return { ok: false as const, reason: "not_available" };
    const { data: service } = await ctx.db.from("services").select("name").eq("id", serviceId).eq("business_id", ctx.businessId).maybeSingle();
    if (ctx.dryRun) return { ok: true as const, service: service?.name, startsAt, testMode: "not saved" };
    if (!ctx.customerId) return { ok: false as const, reason: "no_customer" };
    const { data, error } = await ctx.db.rpc("book_appointment", {
      p_business_id: ctx.businessId,
      p_customer_id: ctx.customerId,
      p_service_id: serviceId,
      p_starts_at: slot.starts_at,
      p_conversation_id: ctx.conversationId ?? undefined,
      p_notes: notes,
    });
    if (error?.code === "WB410") return { ok: false as const, reason: "not_available" };
    if (error || !data) return { ok: false as const, reason: "rejected" };
    return { ok: true as const, appointmentId: data, service: service?.name, startsAt };
  },
});

export const getMyAppointments = tool({
  name: "getMyAppointments",
  description: "THIS customer's upcoming appointments (service, local start time, status).",
  input: z.object({}),
  async run(ctx) {
    if (!ctx.customerId) return { appointments: [] };
    const tz = await businessTimezone(ctx);
    const { data } = await ctx.db
      .from("appointments")
      .select("id, service_name, starts_at, status")
      .eq("business_id", ctx.businessId)
      .eq("customer_id", ctx.customerId)
      .in("status", ["booked", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10);
    return { appointments: (data ?? []).map((a) => ({ appointmentId: a.id, service: a.service_name, startsAt: localStamp(new Date(a.starts_at), tz), status: a.status })) };
  },
});

export const cancelAppointment = tool({
  name: "cancelAppointment",
  description: "Cancel one of THIS customer's upcoming appointments (appointmentId from getMyAppointments), when they ask to cancel or move it.",
  input: z.object({ appointmentId: z.uuid() }),
  async run(ctx, { appointmentId }) {
    if (ctx.dryRun) return { ok: true as const, testMode: "not saved" };
    if (!ctx.customerId) return { ok: false as const };
    const { data } = await ctx.db
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId)
      .eq("business_id", ctx.businessId)
      .eq("customer_id", ctx.customerId)
      .in("status", ["booked", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .select("id");
    return { ok: Boolean(data?.length) };
  },
});

/** Test chat: what createOrder would record, priced from the catalog, without saving anything. */
async function estimateOrder(ctx: ToolContext, items: { productId: string; variantId?: string; quantity: number; extras?: string[] }[]) {
  const { data } = await ctx.db
    .from("products")
    .select("id, name, price, currency, active, stock_quantity, options, extras, product_variants(id, name, value, options, price_modifier, stock_quantity)")
    .eq("business_id", ctx.businessId)
    .in("id", items.map((i) => i.productId));
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  let total = 0;
  let currency = "XAF";
  // Same stock rule as create_order(): a tracked variant's stock, otherwise the product's.
  const wanted = new Map<string, number>();
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p || !p.active) return { ok: false as const, reason: "rejected" };
    const variant = item.variantId ? p.product_variants.find((v) => v.id === item.variantId) : null;
    if (item.variantId && !variant) return { ok: false as const, reason: "rejected" };
    if (!variant && p.product_variants.some((v) => parseCombination(v.options))) return { ok: false as const, reason: "choose_options", item: p.name };
    const tracked = variant && variant.stock_quantity !== null ? { key: `v:${variant.id}`, stock: variant.stock_quantity } : p.stock_quantity !== null ? { key: `p:${p.id}`, stock: p.stock_quantity } : null;
    if (tracked) {
      const qty = (wanted.get(tracked.key) ?? 0) + item.quantity;
      wanted.set(tracked.key, qty);
      if (qty > tracked.stock) return { ok: false as const, reason: "out_of_stock", item: variant ? `${p.name} (${variantLabel(variant, p.options)})` : p.name };
    }
    const menuExtras = parseExtras(p.extras);
    const chosen = [...new Set((item.extras ?? []).map((e) => e.trim().toLowerCase()))].map((e) => menuExtras.find((x) => x.name.toLowerCase() === e));
    if (chosen.some((e) => !e)) return { ok: false as const, reason: "unknown_extra", item: p.name };
    total += linePrice(Math.max(0, Number(p.price) + Number(variant?.price_modifier ?? 0)), chosen as Extra[]) * item.quantity;
    currency = p.currency;
  }
  return { ok: true as const, orderNumber: "TEST-00001", total, currency, testMode: "not saved" };
}

/** Everything the assistant may call, by name. */
export const TOOLS = {
  getBusinessInformation,
  searchProducts,
  viewProductPhotos,
  checkProductStock,
  checkProductOptions,
  getBusinessHours,
  getDeliveryFee,
  createCustomer,
  createOrder,
  getOrderStatus,
  findMyDocuments,
  requestHumanAgent,
  findAvailableSlots,
  bookAppointment,
  getMyAppointments,
  cancelAppointment,
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
