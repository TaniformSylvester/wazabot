import { authorize } from "@/lib/auth/dal";
import { getPlanLimits, profitAllowed, reportDaysAllowed } from "@/lib/data/queries";
import { addDays, expensesBetween, groupDays, productSales, resolvePeriod, salesByDay, topCustomers, type ReportGroup } from "@/lib/data/reports";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/load";
import { toCsv, type Cell } from "@/lib/reports/csv";

const TYPES = ["sales", "products", "customers", "expenses"] as const;

/**
 * CSV download of one report section (owners and admins). The period is
 * resolved the same way as on the reports page; the database functions
 * check the role again.
 */
export async function GET(request: Request, ctx: RouteContext<"/[lang]/dashboard/reports/export">) {
  const { lang } = await ctx.params;
  if (!isLocale(lang)) return new Response("Not found", { status: 404 });
  const auth = await authorize("admin");
  if (!auth) return new Response("Forbidden", { status: 403 });
  const { business } = auth;
  const url = new URL(request.url);
  const type = TYPES.find((t) => t === url.searchParams.get("type"));
  if (!type) return new Response("Unknown report", { status: 400 });
  const period = resolvePeriod(business.timezone, {
    range: "custom",
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    group: url.searchParams.get("group") ?? undefined,
  });
  // Same plan rules as the reports page: Free = recent days only, no costs or profit.
  const limits = await getPlanLimits(business.id);
  const withProfit = profitAllowed(limits);
  const maxDays = reportDaysAllowed(limits);
  if (maxDays) {
    const earliest = addDays(period.today, -(maxDays - 1));
    if (period.from < earliest) period.from = earliest;
    if (period.to < earliest) period.to = period.today;
  }
  if (type === "expenses" && !withProfit) return new Response("Needs a paid plan", { status: 403 });
  const { from, to, group } = period;
  const r = (await getDictionary(lang)).dashboard;
  const rep = r.reports;
  const cur = business.currency;
  let header: string[];
  let rows: Cell[][];

  switch (type) {
    case "sales": {
      const days = groupDays(await salesByDay(business.id, from, to), group as ReportGroup);
      header = withProfit
        ? [rep.sales.period, rep.sales.sales, `${rep.sales.revenue} (${cur})`, `${rep.sales.cogs} (${cur})`, `${rep.sales.profit} (${cur})`, `${rep.summary.discounts} (${cur})`]
        : [rep.sales.period, rep.sales.sales, `${rep.sales.revenue} (${cur})`, `${rep.summary.discounts} (${cur})`];
      rows = days.map((d) => (withProfit ? [d.day, d.sales, d.revenue, d.cogs, d.revenue - d.cogs, d.discounts] : [d.day, d.sales, d.revenue, d.discounts]));
      break;
    }
    case "products": {
      const products = await productSales(business.id, from, to);
      header = withProfit
        ? [rep.products.product, rep.products.quantity, `${rep.products.revenue} (${cur})`, `${rep.products.cost} (${cur})`, `${rep.products.profit} (${cur})`]
        : [rep.products.product, rep.products.quantity, `${rep.products.revenue} (${cur})`];
      rows = products.map((p) => (withProfit ? [p.name, p.quantity, p.revenue, p.cogs, p.profit] : [p.name, p.quantity, p.revenue]));
      break;
    }
    case "customers": {
      const customers = await topCustomers(business.id, business.timezone, from, to, 5000);
      header = [rep.customers.name, rep.customers.purchases, `${rep.customers.spent} (${cur})`, `${rep.customers.paid} (${cur})`];
      rows = customers.map((c) => [c.name, c.sales, c.spent, c.paid]);
      break;
    }
    case "expenses": {
      const expenses = await expensesBetween(business.id, from, to);
      const cat = (c: string) => r.expenses.categories[c as keyof typeof r.expenses.categories] ?? c;
      const method = (m: string | null) => (m ? (r.payments.methods[m as keyof typeof r.payments.methods] ?? m) : "");
      header = [rep.expenses.date, rep.expenses.category, rep.expenses.description, `${rep.expenses.amount} (${cur})`, rep.expenses.method, rep.expenses.reference];
      rows = expenses.map((e) => [e.spent_on, cat(e.category), e.description, e.amount, method(e.payment_method), e.reference]);
      break;
    }
  }

  const name = `${business.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "wazabolt"}-${type}-${from}-${to}.csv`;
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
