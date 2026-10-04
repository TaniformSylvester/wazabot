import type { ToolContext } from "@/lib/ai/tools/registry";

import type { SimBusiness } from "./businesses";

/*
 * Just enough of the Supabase query builder for the assistant's read-only
 * tools (catalog search, stock, order estimate, delivery note, free slots)
 * to run unchanged against a sample business held in memory.
 *
 * Supported: from().select().eq().in().or("col.ilike.%w%,…").order().limit()
 * and maybeSingle()/single(), rpc() with canned results. eq() on a column a
 * row doesn't have is ignored (the tools also filter by business_id).
 */

type Row = Record<string, unknown>;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private one: "single" | "maybe" | null = null;
  private max: number | null = null;

  constructor(private rows: Row[]) {}

  select() {
    return this;
  }
  order() {
    return this;
  }
  eq(col: string, value: unknown) {
    this.rows = this.rows.filter((r) => !(col in r) || r[col] === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.rows = this.rows.filter((r) => values.includes(r[col]));
    return this;
  }
  or(expr: string) {
    const tests = expr.split(",").map((part) => {
      const [col, , ...rest] = part.split(".");
      const word = rest.join(".").replace(/^%|%$/g, "").toLowerCase();
      return (r: Row) => typeof r[col] === "string" && (r[col] as string).toLowerCase().includes(word);
    });
    this.rows = this.rows.filter((r) => tests.some((t) => t(r)));
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  then<A = { data: unknown; error: null }, B = never>(resolve?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, reject?: ((e: unknown) => B | PromiseLike<B>) | null) {
    const rows = this.max === null ? this.rows : this.rows.slice(0, this.max);
    const data = this.one ? (rows[0] ?? null) : rows;
    return Promise.resolve({ data, error: null as null }).then(resolve, reject);
  }
}

export function memoryDb(sim: SimBusiness, now: () => Date): ToolContext["db"] {
  const businessId = sim.context.business.id;
  const tables: Record<string, Row[]> = {
    businesses: [{ id: businessId, name: sim.context.business.name, timezone: sim.context.business.timezone, opening_hours: sim.context.business.openingHours }],
    products: sim.products.map((p) => ({
      id: p.id,
      business_id: businessId,
      active: true,
      name: p.name,
      description: p.description,
      category: p.category,
      sku: null,
      price: p.price,
      currency: "XAF",
      stock_quantity: p.stock,
      image_url: null,
      product_variants: p.variants.map((v) => ({ id: v.id, name: v.name, value: v.value, price_modifier: v.priceModifier, stock_quantity: v.stock })),
    })),
    knowledge_documents: sim.context.documents.map((d) => ({ business_id: businessId, active: true, document_type: d.type, title: d.title, content: d.content })),
  };
  const rpc = (name: string) => {
    if (name === "available_slots") {
      // A few free times over the next days, like a half-full salon.
      const start = new Date(now());
      start.setUTCHours(9, 0, 0, 0);
      const slots = [1, 1, 2, 2, 3].map((day, i) => ({ starts_at: new Date(start.getTime() + day * 86_400_000 + (i % 2 ? 5 : 1) * 3_600_000).toISOString() }));
      return Promise.resolve({ data: slots, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  return { from: (table: string) => new Query([...(tables[table] ?? [])]), rpc } as unknown as ToolContext["db"];
}
