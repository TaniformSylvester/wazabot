import type { AppRole } from "@/lib/auth/permissions";

/*
 * Field-level rules for catalog changes (products, which are also restaurant
 * menu items). Owners and managers may change every field. Staff may change
 * availability and stock status only:
 *
 *   isAvailable / inStock → products.active (setProductActive)
 *   stockCount            → a counted stock quantity (adjustStock, reason "adjustment")
 *
 * Prices, names, descriptions, photos, categories and deleting stay with
 * owners and managers. The database enforces the same: products can only be
 * updated by admins (RLS), and adjust_stock() lets agents record a count only.
 */

/** Product fields staff may change. */
export const STAFF_PRODUCT_FIELDS = ["active", "stock_quantity"] as const;

/** Stock reasons staff may record: a stock count only. */
export const STAFF_STOCK_REASONS = ["adjustment"] as const;

/** The fields in `changes` this role may not change (empty: allowed). */
export function forbiddenProductFields(role: AppRole, changes: Record<string, unknown>): string[] {
  if (role !== "staff") return [];
  const allowed: readonly string[] = STAFF_PRODUCT_FIELDS;
  return Object.keys(changes).filter((k) => changes[k] !== undefined && !allowed.includes(k));
}

/** Whether this role may record this stock change (staff: a count with the counted quantity, nothing else). */
export function stockChangeAllowed(role: AppRole, change: { reason: string; counted?: number | null; quantity?: number | null }): boolean {
  if (role !== "staff") return true;
  return (STAFF_STOCK_REASONS as readonly string[]).includes(change.reason) && change.counted != null && change.quantity == null;
}
