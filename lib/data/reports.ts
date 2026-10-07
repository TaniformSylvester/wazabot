import "server-only";

import { createClient } from "@/lib/supabase/server";

import { getStockAlerts, localDayStart, localToday, productCosts } from "./queries";

/*
 * Business figures for the dashboard and the reports. Everything comes from
 * recorded sales, payments, expenses and stock: nothing is estimated except
 * profit, which is labelled as such (it uses each item's cost at the time of
 * sale, and items sold without a cost price count as zero cost).
 *
 * Sales = completed orders (status delivered: POS sales and delivered orders).
 * Costs and profit come from owner/admin-only database functions.
 */

/** YYYY-MM-DD plus n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every date from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d);
  return out;
}

export type DayFigures = { day: string; sales: number; revenue: number; cogs: number; itemsWithoutCost: number; discounts: number };

/** Owners/admins: completed sales per local day (revenue, cost of goods sold, discounts). Days without sales are omitted. */
export async function salesByDay(businessId: string, from: string, to: string): Promise<DayFigures[]> {
  const db = await createClient();
  const { data, error } = await db.rpc("sales_by_day", { p_business_id: businessId, p_from: from, p_to: to });
  if (error) return [];
  return (data ?? []).map((r) => ({
    day: r.day,
    sales: r.sales,
    revenue: Number(r.revenue),
    cogs: Number(r.cogs),
    itemsWithoutCost: r.items_without_cost,
    discounts: Number(r.discounts),
  }));
}

export type ProductFigures = { productId: string | null; name: string; quantity: number; revenue: number; cogs: number; profit: number; itemsWithoutCost: number };

/** Owners/admins: completed sales per product over a period. */
export async function productSales(businessId: string, from: string, to: string): Promise<ProductFigures[]> {
  const db = await createClient();
  const { data, error } = await db.rpc("product_sales", { p_business_id: businessId, p_from: from, p_to: to });
  if (error) return [];
  return (data ?? []).map((r) => ({
    productId: r.product_id,
    name: r.product_name,
    quantity: r.quantity,
    revenue: Number(r.revenue),
    cogs: Number(r.cogs),
    profit: Number(r.revenue) - Number(r.cogs),
    itemsWithoutCost: r.items_without_cost,
  }));
}

/** Totals over a list of days. */
export function sumDays(days: DayFigures[]) {
  const t = days.reduce(
    (a, d) => ({ sales: a.sales + d.sales, revenue: a.revenue + d.revenue, cogs: a.cogs + d.cogs, itemsWithoutCost: a.itemsWithoutCost + d.itemsWithoutCost, discounts: a.discounts + d.discounts }),
    { sales: 0, revenue: 0, cogs: 0, itemsWithoutCost: 0, discounts: 0 },
  );
  return { ...t, grossProfit: t.revenue - t.cogs };
}

/** Days grouped by ISO week (Monday) or by month; the key is the first day of the period. */
export function groupDays(days: DayFigures[], by: "day" | "week" | "month"): DayFigures[] {
  if (by === "day") return days;
  const groups = new Map<string, DayFigures>();
  for (const d of days) {
    let key = d.day.slice(0, 7) + "-01";
    if (by === "week") {
      const wd = (new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7;
      key = addDays(d.day, -wd);
    }
    const g = groups.get(key) ?? { day: key, sales: 0, revenue: 0, cogs: 0, itemsWithoutCost: 0, discounts: 0 };
    g.sales += d.sales;
    g.revenue += d.revenue;
    g.cogs += d.cogs;
    g.itemsWithoutCost += d.itemsWithoutCost;
    g.discounts += d.discounts;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Expenses between two dates (inclusive). RLS returns nothing to roles below admin. */
export async function expensesBetween(businessId: string, from: string, to: string) {
  const db = await createClient();
  const { data } = await db
    .from("expenses")
    .select("id, category, amount, spent_on, description, payment_method, reference")
    .eq("business_id", businessId)
    .gte("spent_on", from)
    .lte("spent_on", to)
    .order("spent_on")
    .limit(10000);
  return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
}

/** Customers who owe, largest balance first. */
export async function customersWhoOwe(businessId: string, max = 10) {
  const db = await createClient();
  const { data } = await db
    .from("customer_stats")
    .select("customer_id, outstanding, last_purchase_at")
    .eq("business_id", businessId)
    .gt("outstanding", 0)
    .order("outstanding", { ascending: false })
    .limit(5000);
  const rows = data ?? [];
  const total = rows.reduce((a, r) => a + Number(r.outstanding ?? 0), 0);
  const top = rows.slice(0, max);
  const ids = top.map((r) => r.customer_id).filter((x): x is string => !!x);
  const { data: names } = ids.length ? await db.from("customers").select("id, name, whatsapp_phone").in("id", ids) : { data: [] };
  const byId = new Map((names ?? []).map((c) => [c.id, c]));
  return {
    count: rows.length,
    total,
    top: top.map((r) => ({
      id: r.customer_id!,
      name: byId.get(r.customer_id!)?.name || `+${byId.get(r.customer_id!)?.whatsapp_phone ?? ""}`,
      outstanding: Number(r.outstanding),
      lastPurchase: r.last_purchase_at,
    })),
  };
}

/** Customers ranked by what they bought in a period (completed sales). */
export async function topCustomers(businessId: string, timezone: string, from: string, to: string, max = 10) {
  const db = await createClient();
  const { data } = await db
    .from("orders")
    .select("customer_id, total, amount_paid, customers(name, whatsapp_phone)")
    .eq("business_id", businessId)
    .eq("status", "delivered")
    .not("customer_id", "is", null)
    .gte("created_at", localDayStart(from, timezone))
    .lt("created_at", localDayStart(to, timezone, 1))
    .limit(20000);
  const by = new Map<string, { id: string; name: string; sales: number; spent: number; paid: number }>();
  for (const o of data ?? []) {
    const id = o.customer_id!;
    const c = by.get(id) ?? { id, name: o.customers?.name || `+${o.customers?.whatsapp_phone ?? ""}`, sales: 0, spent: 0, paid: 0 };
    c.sales += 1;
    c.spent += Number(o.total);
    c.paid += Number(o.amount_paid);
    by.set(id, c);
  }
  return [...by.values()].sort((a, b) => b.spent - a.spent).slice(0, max);
}

/** Products sold over a period ranked by quantity (no costs: any team member may see it). */
async function bestSellers(businessId: string, timezone: string, from: string, max = 5) {
  const db = await createClient();
  const { data } = await db
    .from("order_items")
    .select("product_id, product_name, quantity, total, orders!inner(status, created_at)")
    .eq("business_id", businessId)
    .eq("orders.status", "delivered")
    .gte("orders.created_at", localDayStart(from, timezone))
    .limit(20000);
  const by = new Map<string, { productId: string | null; name: string; quantity: number; revenue: number }>();
  for (const i of data ?? []) {
    const key = i.product_id ?? `name:${i.product_name}`;
    const p = by.get(key) ?? { productId: i.product_id, name: i.product_name, quantity: 0, revenue: 0 };
    p.quantity += i.quantity;
    p.revenue += Number(i.total);
    by.set(key, p);
  }
  return [...by.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, max);
}

/** Active products: how many, low, out of stock, and stock value at selling price and (admins) at cost. */
async function inventoryStats(businessId: string, withCost: boolean) {
  const db = await createClient();
  const { data } = await db
    .from("products")
    .select("id, price, stock_quantity, low_stock_threshold, product_variants(stock_quantity, price_modifier)")
    .eq("business_id", businessId)
    .eq("active", true)
    .limit(5000);
  const costs = withCost ? await productCosts(businessId) : new Map<string, number | null>();
  let low = 0;
  let out = 0;
  let retail = 0;
  let cost = 0;
  let missingCost = 0;
  for (const p of data ?? []) {
    const tracked = p.product_variants.filter((v) => v.stock_quantity !== null);
    const lines = tracked.length
      ? tracked.map((v) => ({ qty: v.stock_quantity!, price: Number(p.price) + Number(v.price_modifier ?? 0) }))
      : p.stock_quantity !== null
        ? [{ qty: p.stock_quantity, price: Number(p.price) }]
        : [];
    for (const l of lines) {
      if (l.qty === 0) out += 1;
      else if (l.qty <= p.low_stock_threshold) low += 1;
      retail += l.qty * l.price;
      const unitCost = costs.get(p.id) ?? null;
      if (unitCost === null) missingCost += l.qty > 0 ? 1 : 0;
      else cost += l.qty * unitCost;
    }
  }
  return { products: data?.length ?? 0, low, out, retailValue: retail, costValue: cost, missingCost };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;

/**
 * The dashboard home: today, the last 7 days, this month, a 30-day trend,
 * best sellers, stock, customers and credit. Profit, costs and expenses are
 * only returned when `withProfit` (owners and admins).
 */
export async function getOverview(businessId: string, timezone: string, withProfit: boolean) {
  const db = await createClient();
  const today = localToday(timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const weekFrom = addDays(today, -6);
  const trendFrom = addDays(today, -29);
  const from = monthStart < trendFrom ? monthStart : trendFrom;

  const [orders, cogs, received, owe, customers, newCustomers, best, stock, alerts, monthExpenses] = await Promise.all([
    db
      .from("orders")
      .select("total, created_at")
      .eq("business_id", businessId)
      .eq("status", "delivered")
      .gte("created_at", localDayStart(from, timezone))
      .limit(20000),
    withProfit ? salesByDay(businessId, from, today) : Promise.resolve([] as DayFigures[]),
    db.from("order_payments").select("amount").eq("business_id", businessId).gte("received_at", localDayStart(today, timezone)).limit(20000),
    customersWhoOwe(businessId, 5),
    db.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    db.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", localDayStart(monthStart, timezone)),
    bestSellers(businessId, timezone, monthStart),
    inventoryStats(businessId, withProfit),
    getStockAlerts(businessId, 6),
    withProfit ? expensesBetween(businessId, monthStart, today) : Promise.resolve([]),
  ]);

  // Revenue and number of sales per local day, for every role.
  const perDay = new Map<string, { sales: number; revenue: number }>();
  for (const o of orders.data ?? []) {
    const day = localToday(timezone, new Date(o.created_at));
    const d = perDay.get(day) ?? { sales: 0, revenue: 0 };
    d.sales += 1;
    d.revenue += Number(o.total);
    perDay.set(day, d);
  }
  const cogsByDay = new Map(cogs.map((c) => [c.day, c]));
  const period = (start: string) => {
    let sales = 0;
    let revenue = 0;
    let cost = 0;
    let withoutCost = 0;
    for (const [day, v] of perDay) {
      if (day < start || day > today) continue;
      sales += v.sales;
      revenue += v.revenue;
      cost += cogsByDay.get(day)?.cogs ?? 0;
      withoutCost += cogsByDay.get(day)?.itemsWithoutCost ?? 0;
    }
    return { sales, revenue, profit: withProfit ? revenue - cost : null, itemsWithoutCost: withoutCost };
  };
  const month = period(monthStart);
  const expenses = monthExpenses.reduce((a, e) => a + e.amount, 0);

  return {
    today: { ...period(today), received: (received.data ?? []).reduce((a, p) => a + Number(p.amount), 0) },
    week: period(weekFrom),
    month: { ...month, expenses: withProfit ? expenses : null, netProfit: withProfit && month.profit !== null ? month.profit - expenses : null },
    trend: dateRange(trendFrom, today).map((day) => ({ day, ...(perDay.get(day) ?? { sales: 0, revenue: 0 }) })),
    bestSellers: best,
    stock: { ...stock, costValue: withProfit ? stock.costValue : null, alerts: alerts.alerts, alertCount: alerts.total },
    customers: { total: customers.count ?? 0, newThisMonth: newCustomers.count ?? 0, owing: owe.count, outstanding: owe.total, topOwing: owe.top },
  };
}

export const REPORT_RANGES = ["today", "7d", "30d", "month", "lastMonth", "custom"] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];
export const REPORT_GROUPS = ["day", "week", "month"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: string | undefined): v is string => !!v && DATE.test(v) && !Number.isNaN(Date.parse(v));

/**
 * The report period from query parameters, in the business's local dates.
 * Custom ranges are capped at two years and never end after today.
 */
export function resolvePeriod(timezone: string, p: { range?: string; from?: string; to?: string; group?: string }) {
  const today = localToday(timezone);
  let range: ReportRange = REPORT_RANGES.find((r) => r === p.range) ?? "30d";
  let from: string;
  let to = today;
  switch (range) {
    case "today":
      from = today;
      break;
    case "7d":
      from = addDays(today, -6);
      break;
    case "month":
      from = `${today.slice(0, 8)}01`;
      break;
    case "lastMonth":
      to = addDays(`${today.slice(0, 8)}01`, -1);
      from = `${to.slice(0, 8)}01`;
      break;
    case "custom":
      if (validDate(p.from) && validDate(p.to)) {
        to = p.to > today ? today : p.to;
        from = p.from > to ? to : p.from;
        if (from < addDays(to, -731)) from = addDays(to, -731);
        break;
      }
      range = "30d";
      from = addDays(today, -29);
      break;
    default:
      from = addDays(today, -29);
  }
  const group: ReportGroup = REPORT_GROUPS.find((g) => g === p.group) ?? (dateRange(from, to).length > 62 ? "month" : "day");
  return { range, from, to, group, today };
}

export type ReportData = Awaited<ReturnType<typeof getReport>>;

/** Everything on the reports page for one period (owners/admins). */
export async function getReport(businessId: string, timezone: string, from: string, to: string) {
  const [days, products, expenses, customers, owing, stock] = await Promise.all([
    salesByDay(businessId, from, to),
    productSales(businessId, from, to),
    expensesBetween(businessId, from, to),
    topCustomers(businessId, timezone, from, to, 10),
    customersWhoOwe(businessId, 10),
    getStockAlerts(businessId, 10),
  ]);
  const totals = sumDays(days);
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const byCategory = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    byMonth.set(e.spent_on.slice(0, 7), (byMonth.get(e.spent_on.slice(0, 7)) ?? 0) + e.amount);
  }
  return {
    days,
    totals: { ...totals, expenses: expenseTotal, netProfit: totals.grossProfit - expenseTotal },
    products,
    expenses,
    expensesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    expensesByMonth: [...byMonth.entries()].map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month)),
    customers,
    owing,
    stock,
  };
}
