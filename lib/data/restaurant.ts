import "server-only";

import { variantAvailable, variantLabel } from "@/lib/products/options";
import { parseExtras, type Extra } from "@/lib/restaurant/extras";
import { createClient } from "@/lib/supabase/server";
import type { ServiceType, TicketStatus } from "@/types/database";

/*
 * WazaBolt Restaurants — reads for the dashboard (user's session: RLS keeps
 * every business to its own data; kitchen staff read through kitchen_queue()).
 */

export type RestaurantTable = { id: string; name: string; area: string | null; seats: number | null; active: boolean; sort_order: number };

export async function listTables(businessId: string, includeOff = false): Promise<RestaurantTable[]> {
  const db = await createClient();
  let q = db.from("restaurant_tables").select("id, name, area, seats, active, sort_order").eq("business_id", businessId);
  if (!includeOff) q = q.eq("active", true);
  const { data } = await q.order("sort_order").order("name");
  return data ?? [];
}

const OPEN_STATUSES = ["pending", "confirmed", "processing", "ready", "out_for_delivery"];

export type OpenOrder = {
  id: string;
  order_number: string;
  service_type: ServiceType;
  table_id: string | null;
  status: string;
  channel: string;
  total: number;
  balance_due: number;
  guests: number | null;
  created_at: string;
  customerName: string | null;
  dishes: number;
  readyRounds: number;
};

/** The floor: tables with their open bill (if any), and takeaway/delivery orders in progress. */
export async function floorState(businessId: string) {
  const db = await createClient();
  const [tables, { data: orders }] = await Promise.all([
    listTables(businessId),
    db
      .from("orders")
      .select("id, order_number, service_type, table_id, status, channel, total, balance_due, guests, created_at, customers(name), order_items(quantity), kitchen_tickets(status)")
      .eq("business_id", businessId)
      .not("service_type", "is", null)
      .is("bill_closed_at", null)
      .in("status", OPEN_STATUSES)
      .order("created_at")
      .limit(200),
  ]);
  const open: OpenOrder[] = (orders ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    service_type: o.service_type as ServiceType,
    table_id: o.table_id,
    status: o.status,
    channel: o.channel,
    total: Number(o.total),
    balance_due: Number(o.balance_due ?? 0),
    guests: o.guests,
    created_at: o.created_at,
    customerName: o.customers?.name ?? null,
    dishes: o.order_items.reduce((n, i) => n + i.quantity, 0),
    readyRounds: o.kitchen_tickets.filter((t) => t.status === "ready").length,
  }));
  const byTable = new Map(open.filter((o) => o.service_type === "dine_in" && o.table_id).map((o) => [o.table_id!, o]));
  return {
    tables: tables.map((t) => ({ ...t, bill: byTable.get(t.id) ?? null })),
    others: open.filter((o) => o.service_type !== "dine_in"),
  };
}

export type BillLine = { id: string; product_name: string; variant: string | null; quantity: number; unit_price: number; total: number; extras: Extra[]; note: string | null; ticket_id: string | null };
export type BillTicket = { id: string; seq: number; status: TicketStatus; created_at: string; lines: BillLine[] };

/** A restaurant order with its lines grouped by kitchen round (lines not sent yet come last). */
export async function getRestaurantOrder(businessId: string, id: string) {
  const db = await createClient();
  const { data: o } = await db
    .from("orders")
    .select(
      "id, order_number, service_type, table_id, status, channel, currency, subtotal, delivery_fee, discount, total, amount_paid, amount_refunded, balance_due, guests, notes, created_at, bill_closed_at, delivery_address, recipient_phone, customer_id, customers(name, whatsapp_phone), restaurant_tables(name), order_items(id, product_name, variant, quantity, unit_price, total, extras, note, ticket_id), kitchen_tickets(id, seq, status, created_at)",
    )
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!o || !o.service_type) return null;
  const lines: BillLine[] = o.order_items.map((i) => ({ ...i, unit_price: Number(i.unit_price), total: Number(i.total), extras: parseExtras(i.extras) }));
  const tickets: BillTicket[] = [...o.kitchen_tickets]
    .sort((a, b) => a.seq - b.seq)
    .map((t) => ({ ...t, status: t.status as TicketStatus, lines: lines.filter((l) => l.ticket_id === t.id) }));
  return {
    ...o,
    service_type: o.service_type as ServiceType,
    total: Number(o.total),
    subtotal: Number(o.subtotal),
    delivery_fee: Number(o.delivery_fee),
    discount: Number(o.discount),
    amount_paid: Number(o.amount_paid),
    amount_refunded: Number(o.amount_refunded),
    balance_due: Number(o.balance_due ?? 0),
    tableName: o.restaurant_tables?.name ?? null,
    tickets,
    unsent: lines.filter((l) => !l.ticket_id),
    lineCount: lines.length,
    open: !o.bill_closed_at && !["delivered", "cancelled", "returned"].includes(o.status),
  };
}

export type MenuDish = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  extras: Extra[];
  variants: { id: string; label: string; price: number; available: boolean }[];
  available: boolean;
};

/** Active dishes for the order screens (prices from the catalog; the database prices the order again). */
export async function listMenu(businessId: string): Promise<MenuDish[]> {
  const db = await createClient();
  const { data } = await db
    .from("products")
    .select("id, name, category, price, stock_quantity, options, extras, product_variants(id, name, value, options, price_modifier, stock_quantity, sort_order)")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("category", { nullsFirst: false })
    .order("name")
    .limit(500);
  return (data ?? []).map((p) => {
    const variants = [...p.product_variants]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({ id: v.id, label: variantLabel(v, p.options), price: Math.max(0, Number(p.price) + Number(v.price_modifier)), available: variantAvailable(v, p.stock_quantity) }));
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: Number(p.price),
      extras: parseExtras(p.extras),
      variants,
      available: variants.length ? variants.some((v) => v.available) : p.stock_quantity === null || p.stock_quantity > 0,
    };
  });
}

export type KitchenTicket = {
  id: string;
  seq: number;
  status: "new" | "preparing" | "ready";
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  orderNumber: string;
  serviceType: ServiceType;
  table: string | null;
  items: { name: string; variant: string | null; quantity: number; extras: string[]; note: string | null }[];
};

/** The kitchen screen (kitchen staff and any staff): open tickets, no prices or customers, and when they were read. */
export async function kitchenQueue(businessId: string): Promise<{ tickets: KitchenTicket[] | null; at: number }> {
  const db = await createClient();
  const { data, error } = await db.rpc("kitchen_queue", { p_business_id: businessId });
  return { tickets: error ? null : ((Array.isArray(data) ? data : []) as unknown as KitchenTicket[]), at: Date.now() };
}
