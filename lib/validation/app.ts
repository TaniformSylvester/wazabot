import { z } from "zod";

import { ADJUST_REASONS, AFTER_HOURS_MODES, DELIVERY_METHODS, DOCUMENT_TYPES, EXPENSE_CATEGORIES, INDUSTRIES, ORDER_STATUSES, PAYMENT_METHODS, PRODUCT_UNITS, RECEIVE_METHODS, CONVERSATION_STATUSES } from "@/types/database";
import { REPLY_LENGTHS, TONES } from "@/lib/ai/style";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { combinationCount, combinationKey, MAX_COMBINATIONS, MAX_OPTION_VALUES, MAX_OPTIONS, OPTION_NAME_MAX, OPTION_VALUE_MAX } from "@/lib/products/options";
import { EXTRA_NAME_MAX, MAX_EXTRAS } from "@/lib/restaurant/extras";

/*
 * Dashboard form schemas, shared by forms (field hints) and Server Actions
 * (authoritative). Error messages are keys of auth.validation in messages/.
 */

/** Trimmed text; empty → null. */
export const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(max, "too_long").transform((s) => (s === "" ? null : s)).nullable().optional())
    .transform((v) => v ?? null);

export const requiredText = (max: number, min = 1) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string({ error: "required" }).min(min, "required").max(max, "too_long"));

/** "on" / "true" from checkboxes; missing → false. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Amounts typed as "15 000", "15,000" or "15000" (XAF has no decimals; "." is a decimal point). */
export const money = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return v;
  const cleaned = v.replace(/[\s  ,]/g, "");
  return cleaned === "" ? 0 : Number(cleaned);
}, z.number({ error: "invalid_number" }).finite("invalid_number").min(0, "invalid_number").max(1_000_000_000, "invalid_number"));

/** An amount or blank (→ null, e.g. "cost not entered"). */
export const optionalMoney = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return null;
  return typeof v === "string" ? Number(v.replace(/[\s  ,]/g, "")) : v;
}, z.number({ error: "invalid_number" }).finite("invalid_number").min(0, "invalid_number").max(1_000_000_000, "invalid_number").nullable());

/** Whole number or blank (→ null, e.g. "stock not tracked"). */
export const optionalCount = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return null;
  return typeof v === "string" ? Number(v.replace(/\s/g, "")) : v;
}, z.number({ error: "invalid_integer" }).int("invalid_integer").min(0, "invalid_integer").max(10_000_000, "invalid_integer").nullable());

const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.union([z.literal(""), z.email("invalid_email").max(320, "too_long")]).transform((s) => (s === "" ? null : s)),
);

const optionalUrl = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const s = v.trim();
    return s && !/^https?:\/\//i.test(s) ? `https://${s}` : s;
  },
  z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "invalid_url" }).max(300, "too_long")]).transform((s) => (s === "" ? null : s)),
);

const optionalPhone = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.union([z.literal(""), z.string().regex(/^\+?[0-9 ()-]{6,24}$/, "invalid_phone")]).transform((s) => (s === "" ? null : s)),
);

/** WhatsApp number → digits only with country code (WhatsApp's wa_id format). */
export function normalizeWhatsAppNumber(input: string, defaultCountryCode = "237"): string {
  const digits = input.replace(/[^0-9]/g, "");
  if (input.trim().startsWith("+") || digits.startsWith(defaultCountryCode) || digits.startsWith("00")) {
    return digits.replace(/^00/, "");
  }
  // Local Cameroonian mobile numbers are 9 digits starting with 6.
  return digits.length === 9 ? defaultCountryCode + digits : digits;
}

const whatsappNumber = z.preprocess(
  (v) => (typeof v === "string" ? normalizeWhatsAppNumber(v) : v),
  z.string().regex(/^[0-9]{8,15}$/, "invalid_phone"),
);

const enumOrNull = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(values, { error: "invalid_option" }).nullable());

// ---------------------------------------------------------------------------

export const businessProfileSchema = z.object({
  name: requiredText(120, 2),
  industry: enumOrNull(INDUSTRIES),
  city: optionalText(120),
  address: optionalText(300),
  phone: optionalPhone,
  email: optionalEmail,
  website: optionalUrl,
  description: optionalText(2000),
});
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

function parseJsonField(v: unknown) {
  if (typeof v !== "string" || v.trim() === "") return [];
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** One product option (Colour, Size …) with its values; a colour value may have a swatch and a photo. */
export const productOptionSchema = z.object({
  name: requiredText(OPTION_NAME_MAX),
  colour: z.boolean().optional().transform((v) => v === true),
  values: z
    .array(
      z.object({
        value: requiredText(OPTION_VALUE_MAX),
        hex: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalid_option").nullable()),
        image_url: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().max(500, "too_long").nullable()),
      }),
    )
    .min(1, "required")
    .max(MAX_OPTION_VALUES, "too_long"),
});

export const variantSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText(60),
  value: requiredText(80),
  /** A combination of the product's options, e.g. { Colour: "Red", Size: "M" }; absent for single-option variants. */
  options: z.record(z.string(), z.string().max(OPTION_VALUE_MAX)).nullable().optional(),
  stock_quantity: optionalCount,
  price_modifier: z.preprocess((v) => (v === "" || v === undefined ? 0 : Number(String(v).replace(/[\s,]/g, ""))), z.number({ error: "invalid_number" }).finite().min(-1_000_000_000).max(1_000_000_000)),
});

export const productSchema = z.object({
  name: requiredText(160),
  description: optionalText(4000),
  category: optionalText(80),
  sku: optionalText(64),
  price: money,
  /** What one unit costs the business (profit); blank = unknown. */
  cost_price: optionalMoney,
  unit: z.preprocess((v) => (v === "" || v === undefined ? "piece" : v), z.enum(PRODUCT_UNITS, { error: "invalid_option" })),
  /** Opening stock when the product is created; later changes go through adjust_stock(). */
  stock_quantity: optionalCount,
  /** Minimum stock: "low stock" at or below this many (empty = 5). */
  low_stock_threshold: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 5 : typeof v === "string" ? Number(v.replace(/\s/g, "")) : v),
    z.number({ error: "invalid_integer" }).int("invalid_integer").min(0, "invalid_integer").max(100_000, "invalid_integer"),
  ),
  active: checkbox,
  options: z.preprocess(parseJsonField, z.array(productOptionSchema).max(MAX_OPTIONS, "too_long")),
  variants: z.preprocess(parseJsonField, z.array(variantSchema).max(MAX_COMBINATIONS, "too_long")),
  /** Restaurant module: priced extras (absent when the form doesn't show them, so they're kept). */
  extras: z
    .preprocess(
      (v) => (v === undefined ? undefined : parseJsonField(v)),
      z
        .array(z.object({ name: z.string().trim().min(1).max(EXTRA_NAME_MAX), price: z.number().min(0).max(10_000_000) }), { error: "extras_invalid" })
        .max(MAX_EXTRAS, "extras_invalid")
        .refine((list) => new Set(list.map((e) => e.name.toLowerCase())).size === list.length, "extras_invalid"),
    )
    .optional(),
}).superRefine((p, ctx) => {
  const lower = (s: string) => s.trim().toLowerCase();
  const names = p.options.map((o) => lower(o.name));
  const valuesRepeat = p.options.some((o) => new Set(o.values.map((v) => lower(v.value))).size !== o.values.length);
  if (new Set(names).size !== names.length || valuesRepeat || p.options.filter((o) => o.colour).length > 1) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "options_duplicate" });
    return;
  }
  if (combinationCount(p.options) > MAX_COMBINATIONS) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "options_too_many" });
    return;
  }
  if (!p.options.length) {
    if (p.variants.length > 50) ctx.addIssue({ code: "custom", path: ["variants"], message: "too_long" });
    return;
  }
  // With options, every variant is one combination of them, each at most once.
  const seen = new Set<string>();
  for (const v of p.variants) {
    const c = v.options ?? {};
    const valid =
      Object.keys(c).length === p.options.length && p.options.every((o) => o.values.some((x) => x.value === c[o.name]));
    const key = combinationKey(c, p.options);
    if (!valid || seen.has(key)) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "options_mismatch" });
      return;
    }
    seen.add(key);
  }
});
export type ProductInput = z.infer<typeof productSchema>;

/** Adjust stock: a quantity for purchases, returns, damage and losses; the counted stock for an adjustment. */
export const stockAdjustSchema = z
  .object({
    product_id: z.uuid(),
    variant_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
    reason: z.enum(ADJUST_REASONS, { error: "invalid_option" }),
    quantity: optionalCount,
    counted: optionalCount,
    note: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.reason === "adjustment" && v.counted === null) ctx.addIssue({ code: "custom", path: ["counted"], message: "required" });
    if (v.reason !== "adjustment" && !v.quantity) ctx.addIssue({ code: "custom", path: ["quantity"], message: "required" });
  });

export const faqSchema = z.object({
  question: requiredText(500),
  answer: requiredText(4000),
  category: optionalText(80),
  priority: z.preprocess((v) => (v === "" || v === undefined ? 0 : Number(v)), z.number().int("invalid_integer").min(0, "invalid_integer").max(100, "invalid_integer")),
  active: checkbox,
});

export const documentSchema = z.object({
  title: requiredText(200),
  content: requiredText(20000),
  document_type: z.enum(DOCUMENT_TYPES, { error: "invalid_option" }),
  active: checkbox,
});

export const customerSchema = z.object({
  name: optionalText(120),
  whatsapp_phone: whatsappNumber,
  email: optionalEmail,
  city: optionalText(120),
  notes: optionalText(4000),
  tags: z.preprocess(
    (v) =>
      typeof v === "string"
        ? [...new Set(v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))]
        : v,
    z.array(z.string().max(30, "too_long")).max(20, "too_long"),
  ),
  preferred_language: enumOrNull(LANGUAGE_CODES),
  /** The customer agreed to receive promotions (Stage 8). */
  marketing_opt_in: checkbox,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const orderItemSchema = z.union([
  z.object({ product_id: z.uuid(), variant_id: z.uuid().nullable().optional(), quantity: z.number().int().min(1).max(100000) }),
  z.object({ name: z.string().trim().min(1).max(200), unit_price: z.number().min(0).max(1_000_000_000), quantity: z.number().int().min(1).max(100000) }),
]);

/** Delivery details of an order (all optional; none for a customer who collects). */
export const deliverySchema = z.object({
  delivery_method: enumOrNull(DELIVERY_METHODS),
  recipient_name: optionalText(120),
  recipient_phone: optionalText(24),
  pickup_location: optionalText(300),
  delivery_reference: optionalText(100),
  delivery_notes: optionalText(1000),
});

export const orderSchema = z.object({
  customer_id: z.uuid({ error: "required" }),
  conversation_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
  items: z.preprocess((v) => {
    try {
      return typeof v === "string" ? JSON.parse(v) : v;
    } catch {
      return null;
    }
  }, z.array(orderItemSchema, { error: "min_one_item" }).min(1, "min_one_item").max(100, "too_long")),
  delivery_fee: money,
  discount: money,
  delivery_address: optionalText(500),
  payment_method: enumOrNull(PAYMENT_METHODS),
  notes: optionalText(2000),
  ...deliverySchema.shape,
});

export const orderUpdateSchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { error: "invalid_option" }),
    payment_method: enumOrNull(PAYMENT_METHODS),
    delivery_address: optionalText(500),
    notes: optionalText(2000),
  })
  .extend(deliverySchema.shape);

export const conversationStatusSchema = z.enum(CONVERSATION_STATUSES);

export const aiSettingsSchema = z.object({
  ai_enabled: checkbox,
  tone: z.enum(TONES, { error: "invalid_option" }),
  reply_length: z.enum(REPLY_LENGTHS, { error: "invalid_option" }),
  greeting: optionalText(1000),
  fallback_message: optionalText(1000),
  after_hours_mode: z.enum(AFTER_HOURS_MODES, { error: "invalid_option" }),
  after_hours_message: optionalText(1000),
  human_handover_enabled: checkbox,
  sales_mode: checkbox,
  photo_understanding: checkbox,
  send_documents: checkbox,
});

// ---------------------------------------------------------------------------
// Appointments (Stage 6)
// ---------------------------------------------------------------------------
const intIn = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/\s/g, "")) : v), z.number({ error: "invalid_integer" }).int("invalid_integer").min(min, "invalid_integer").max(max, "invalid_integer"));

export const SLOT_MINUTES = [10, 15, 20, 30, 45, 60, 90, 120] as const;

export const bookingSettingsSchema = z.object({
  enabled: checkbox,
  slot_minutes: z.preprocess((v) => Number(v), z.union(SLOT_MINUTES.map((m) => z.literal(m)), { error: "invalid_option" })),
  capacity: intIn(1, 50),
  /** Typed in hours in the form, stored in minutes. */
  min_notice_hours: intIn(0, 168),
  max_days_ahead: intIn(1, 180),
});

export const serviceSchema = z.object({
  name: requiredText(160),
  description: optionalText(2000),
  duration_minutes: intIn(5, 720),
  /** Blank = price on request. */
  price: z.preprocess((v) => (v === "" || v === undefined ? null : v), money.nullable()),
  active: checkbox,
});

export const appointmentSchema = z.object({
  customer_id: z.uuid({ error: "required" }),
  service_id: z.uuid({ error: "required" }),
  /** Local "YYYY-MM-DDTHH:mm", one of the free slots. */
  starts_at: z.string({ error: "required" }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "required"),
  conversation_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
  notes: optionalText(1000),
});

export const APPOINTMENT_STATUSES = ["booked", "confirmed", "completed", "cancelled", "no_show"] as const;

/** An expense (rent, transport, supplier payment…). The date can't be more than a day ahead (time zones). */
export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { error: "invalid_option" }),
  amount: money.refine((v) => v > 0, "invalid_number"),
  spent_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
    .refine((d) => !Number.isNaN(Date.parse(d)) && Date.parse(d) <= Date.now() + 36 * 3600 * 1000 && d >= "2000-01-01", "invalid_date"),
  description: optionalText(500),
  payment_method: z.preprocess((v) => (v === "" ? null : v), z.enum(RECEIVE_METHODS, { error: "invalid_option" }).nullable().optional()).transform((v) => v ?? null),
  reference: optionalText(100),
});

/** Settings → Receipts. */
export const receiptSettingsSchema = z.object({
  receipt_footer: optionalText(300),
  remove_logo: checkbox,
});
