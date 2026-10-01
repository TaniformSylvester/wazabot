import type { CatalogMatch } from "@/lib/messaging/ports";

/*
 * Guard for image questions: products are looked up with the searchProducts
 * tool (lib/ai/tools/registry.ts); these rules decide whether a match from a
 * photo is clear enough to quote.
 */

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
