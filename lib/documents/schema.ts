import { z } from "zod";

import { DOCUMENT_CURRENCIES, DOCUMENT_LANGUAGES, DOCUMENT_TEMPLATES, DOCUMENT_TYPES, RECEIPT_METHODS } from "./types";

/*
 * Validation of a document coming from a browser (guest generator or dashboard).
 * Error messages are keys of auth.validation in messages/ (shown next to fields).
 */

const text = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(max, "too_long").transform((s) => (s === "" ? null : s)).nullable().optional())
    .transform((v) => v ?? null);
const required = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string({ error: "required" }).min(1, "required").max(max, "too_long"));
const num = (min: number, max: number, msg = "invalid_number") =>
  z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[\s  ,]/g, "")) : v), z.number({ error: msg }).finite(msg).min(min, msg).max(max, msg));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "invalid_date");
const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), isoDate.nullable());
const uuid = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid().nullable()).optional();

export const partySchema = z.object({
  name: required(160),
  reference: text(60),
  address: text(300),
  phone: text(40),
  email: text(160),
  website: text(160),
});

export const lineSchema = z.object({
  description: required(300),
  details: text(1000),
  quantity: num(0.001, 1_000_000, "invalid_quantity").refine((q) => Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6, "invalid_quantity"),
  unitPrice: num(0, 10_000_000_000),
  discountPercent: num(0, 100).optional().default(0),
  productId: uuid,
  variantId: uuid,
  serviceId: uuid,
});

export const documentSchema = (maxItems: number) =>
  z
    .object({
      type: z.enum(DOCUMENT_TYPES, { error: "invalid_option" }),
      template: z.enum(DOCUMENT_TEMPLATES, { error: "invalid_option" }),
      language: z.enum(DOCUMENT_LANGUAGES, { error: "invalid_option" }),
      currency: z.enum(DOCUMENT_CURRENCIES, { error: "invalid_option" }),
      number: text(40),
      issueDate: isoDate,
      dueDate: optionalDate.optional(),
      business: partySchema,
      customer: partySchema,
      items: z.array(lineSchema).min(1, "min_one_item").max(maxItems, "too_many_items"),
      discount: num(0, 10_000_000_000).optional().default(0),
      taxRate: num(0, 100).optional().default(0),
      taxLabel: text(30),
      notes: text(2000),
      terms: text(2000),
      payment: z
        .object({ method: z.enum(RECEIPT_METHODS, { error: "invalid_option" }), reference: text(80), amountPaid: num(0, 100_000_000_000) })
        .nullable()
        .optional(),
    })
    .superRefine((d, ctx) => {
      if (d.dueDate && d.dueDate < d.issueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "due_before_issue" });
      if (d.type === "receipt" && !d.payment) ctx.addIssue({ code: "custom", path: ["payment"], message: "required" });
    });

export type DocumentInput = z.infer<ReturnType<typeof documentSchema>>;

/** Guests: a little smaller than business documents. */
export const GUEST_MAX_ITEMS = 100;
export const BUSINESS_MAX_ITEMS = 200;
