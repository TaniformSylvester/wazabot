import type { CatalogMatch } from "@/lib/messaging/ports";

/**
 * The `search_catalog` tool the assistant must use before stating any price,
 * stock level or product detail — for typed questions and for images alike.
 * Definition is provider-neutral JSON Schema; the Claude call passes it as a
 * custom tool. Implemented against the catalog in Phase 3.
 */
export const searchCatalogTool = {
  name: "search_catalog",
  description:
    "Search this business's product catalog. Call it before giving any price, stock, size, colour or product detail. " +
    "For an image, describe the item in words (type, colour, pattern, visible text or brand) and search with that. " +
    "Only facts returned by this tool may be told to the customer.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Words to search for: product name, type, colour, pattern, visible label text.",
      },
      limit: { type: "integer", minimum: 1, maximum: 10, description: "Maximum results (default 5)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
} as const;

/** A match must be at least this confident before its price/stock can be quoted. */
export const CONFIDENT_MATCH = 0.8;

export type MatchDecision =
  | { kind: "confident"; match: CatalogMatch }
  | { kind: "ambiguous"; candidates: CatalogMatch[] }
  | { kind: "none" };

/**
 * Server-side guard applied to catalog results before the model may quote them:
 * one clearly-best confident match → answer; several close ones → ask which;
 * nothing confident → ask for clarification or hand over. Visual similarity
 * alone never produces a price.
 */
export function decideCatalogMatch(matches: CatalogMatch[]): MatchDecision {
  const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
  const confident = sorted.filter((m) => m.confidence >= CONFIDENT_MATCH);
  if (confident.length === 1) return { kind: "confident", match: confident[0] };
  if (confident.length > 1) {
    // Clearly ahead of the runner-up → still one answer; otherwise let the customer choose.
    if (confident[0].confidence - confident[1].confidence >= 0.15) return { kind: "confident", match: confident[0] };
    return { kind: "ambiguous", candidates: confident.slice(0, 3) };
  }
  const plausible = sorted.filter((m) => m.confidence >= 0.5).slice(0, 3);
  return plausible.length ? { kind: "ambiguous", candidates: plausible } : { kind: "none" };
}
