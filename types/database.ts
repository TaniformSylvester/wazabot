/**
 * Database types. `types/supabase.ts` is generated from the real schema
 * (npm run db:types); this file adds the narrow value types the app uses for
 * text columns that have CHECK constraints.
 */
import type { Database as Generated } from "./supabase";

export type Database = Generated;
export type Json = import("./supabase").Json;

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];

export type BusinessRole = PublicSchema["Enums"]["business_role"];

export const ROLES = ["owner", "admin", "agent", "viewer"] as const satisfies readonly BusinessRole[];
export const ROLE_RANK: Record<BusinessRole, number> = { owner: 4, admin: 3, agent: 2, viewer: 1 };

export const CONVERSATION_STATUSES = ["open", "pending", "resolved", "archived"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const ORDER_STATUSES = ["pending", "confirmed", "processing", "ready", "out_for_delivery", "delivered", "cancelled", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Follows the recorded payments and refunds: unpaid / partial / paid / partially_refunded / refunded. pending and failed are kept for older orders. */
export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "partially_refunded", "refunded", "pending", "failed"] as const;
/** Orders that are over without a sale: they owe nothing and are not purchases. */
export const CLOSED_ORDER_STATUSES = ["cancelled", "returned"] as const;
export const DELIVERY_METHODS = ["pickup", "delivery"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["cash", "mobile_money", "orange_money", "mtn_momo", "bank_transfer", "card", "other"] as const;
/** How a payment was received (order_payments.method, expenses). Credit is not a payment: it is what remains unpaid. */
/** Units a product is sold in (labels in dashboard.products.units). */
export const PRODUCT_UNITS = ["piece", "pair", "kg", "g", "litre", "box", "pack", "dozen", "metre", "yard", "bottle", "bag"] as const;
export const STOCK_REASONS = ["opening", "purchase", "sale", "return", "damaged", "lost", "adjustment"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];
/** Reasons a person can choose (sales and returns of orders are recorded by the system). */
export const ADJUST_REASONS = ["purchase", "return", "damaged", "lost", "adjustment"] as const;
export const RECEIVE_METHODS = ["cash", "mtn_momo", "orange_money", "bank_transfer", "card", "other"] as const;
export type ReceiveMethod = (typeof RECEIVE_METHODS)[number];
export const EXPENSE_CATEGORIES = ["rent", "electricity", "internet", "transport", "salaries", "marketing", "supplier", "packaging", "delivery", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INDUSTRIES = ["retail", "restaurant", "hotel", "fashion", "beauty", "real_estate", "school", "services", "other"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const DOCUMENT_TYPES = ["about", "hours", "delivery", "returns", "policy", "services", "faq", "general"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const WHATSAPP_STATUSES = ["not_connected", "connecting", "connected", "error"] as const;
export type WhatsAppStatus = (typeof WHATSAPP_STATUSES)[number];

export const AFTER_HOURS_MODES = ["reply_normally", "after_hours_message", "handover"] as const;
export type AfterHoursMode = (typeof AFTER_HOURS_MODES)[number];

/** Narrow a CHECK-constrained text column to its union (falls back when the value is unexpected). */
export function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return (values as readonly unknown[]).includes(value) ? (value as T) : fallback;
}
