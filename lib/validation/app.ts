import { z } from "zod";

import { AFTER_HOURS_MODES, DOCUMENT_TYPES, INDUSTRIES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, CONVERSATION_STATUSES } from "@/types/database";
import { REPLY_LENGTHS, TONES } from "@/lib/ai/style";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";

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

export const variantSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText(60),
  value: requiredText(80),
  stock_quantity: optionalCount,
  price_modifier: z.preprocess((v) => (v === "" || v === undefined ? 0 : Number(String(v).replace(/[\s,]/g, ""))), z.number({ error: "invalid_number" }).finite().min(-1_000_000_000).max(1_000_000_000)),
});

export const productSchema = z.object({
  name: requiredText(160),
  description: optionalText(4000),
  category: optionalText(80),
  sku: optionalText(64),
  price: money,
  stock_quantity: optionalCount,
  /** "Low stock" at or below this many (empty = 5). */
  low_stock_threshold: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 5 : typeof v === "string" ? Number(v.replace(/\s/g, "")) : v),
    z.number({ error: "invalid_integer" }).int("invalid_integer").min(0, "invalid_integer").max(100_000, "invalid_integer"),
  ),
  active: checkbox,
  variants: z.preprocess((v) => {
    if (typeof v !== "string" || v.trim() === "") return [];
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }, z.array(variantSchema).max(50, "too_long")),
});
export type ProductInput = z.infer<typeof productSchema>;

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
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const orderItemSchema = z.union([
  z.object({ product_id: z.uuid(), variant_id: z.uuid().nullable().optional(), quantity: z.number().int().min(1).max(100000) }),
  z.object({ name: z.string().trim().min(1).max(200), unit_price: z.number().min(0).max(1_000_000_000), quantity: z.number().int().min(1).max(100000) }),
]);

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
});

export const orderUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES, { error: "invalid_option" }),
  payment_status: z.enum(PAYMENT_STATUSES, { error: "invalid_option" }),
  payment_method: enumOrNull(PAYMENT_METHODS),
  delivery_address: optionalText(500),
  notes: optionalText(2000),
});

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
});
