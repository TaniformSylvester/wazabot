import "server-only";

import { PREFETCH_PRODUCTS } from "@/config/economics";

import { searchProducts, type ToolContext } from "./registry";
import { searchWords } from "./search-words";

export type CatalogMatchItem = Awaited<ReturnType<typeof searchProducts.run>>[number];

/**
 * Products the customer is probably asking about, looked up before the model
 * runs: matches for the latest message first, then for the recent
 * conversation ("je prends 2" refers to the dress asked about before). The
 * model gets them in the turn context, so a price or stock question is
 * answered in one call instead of search → reply.
 */
/** The earlier turns that say what the customer is talking about: their last few messages and our last reply. */
export function recentTopics(history: { role: string; text: string }[]): string[] {
  const earlier = history.slice(0, -1);
  const customer = earlier.filter((h) => h.role === "customer").slice(-3).map((h) => h.text);
  const lastReply = earlier.filter((h) => h.role !== "customer").slice(-1).map((h) => h.text);
  return [...customer, ...lastReply];
}

export async function prefetchCatalog(ctx: ToolContext, latest: string, recent: string[], limit = PREFETCH_PRODUCTS): Promise<CatalogMatchItem[]> {
  const out: CatalogMatchItem[] = [];
  const seen = new Set<string>();
  for (const text of [latest, recent.join(" ")]) {
    if (out.length >= limit || !searchWords(text).length) continue;
    for (const p of await searchProducts.run(ctx, { query: text.slice(0, 300), limit })) {
      if (seen.has(p.productId)) continue;
      seen.add(p.productId);
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}
