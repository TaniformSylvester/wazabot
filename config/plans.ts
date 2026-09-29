/**
 * Subscription plans shown on the marketing site.
 *
 * This is the single source of truth until the `plans` table exists
 * (Phase 8). Plan names and descriptions are translated in the dictionaries
 * (pricing.plans.<id>); prices are formatted per locale with formatXaf().
 *
 * Prices are the initial proposed launch prices — not yet final.
 */
export type Plan = {
  id: "free" | "starter" | "business" | "pro";
  /** Monthly price in the smallest unit of `currency` (XAF has no minor unit). */
  monthlyPrice: number;
  currency: "XAF";
  /** Metered AI conversations included per month. Never "unlimited". */
  aiConversationsPerMonth: number;
  highlighted?: boolean;
};

export const plans: Plan[] = [
  { id: "free", monthlyPrice: 0, currency: "XAF", aiConversationsPerMonth: 50 },
  { id: "starter", monthlyPrice: 10_000, currency: "XAF", aiConversationsPerMonth: 500 },
  { id: "business", monthlyPrice: 25_000, currency: "XAF", aiConversationsPerMonth: 2_000, highlighted: true },
  { id: "pro", monthlyPrice: 50_000, currency: "XAF", aiConversationsPerMonth: 5_000 },
];
