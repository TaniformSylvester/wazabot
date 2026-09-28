/**
 * Subscription plans shown on the marketing site.
 *
 * This is the single source of truth until the `plans` table exists
 * (Phase 8). When plans move to the database, keep this shape so the
 * pricing components only need a different data source.
 *
 * Prices are the initial proposed launch prices — not yet final.
 */
export type Plan = {
  id: "free" | "starter" | "business" | "pro";
  name: string;
  /** Monthly price in the smallest unit of `currency` (XAF has no minor unit). */
  monthlyPrice: number;
  currency: "XAF";
  /** Metered AI conversations included per month. Never "unlimited". */
  aiConversationsPerMonth: number;
  description: string;
  highlighted?: boolean;
};

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    currency: "XAF",
    aiConversationsPerMonth: 50,
    description: "Try WazaBot on your own WhatsApp number.",
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 10_000,
    currency: "XAF",
    aiConversationsPerMonth: 500,
    description: "For small shops and solo businesses.",
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 25_000,
    currency: "XAF",
    aiConversationsPerMonth: 2_000,
    description: "For busy teams answering customers every day.",
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 50_000,
    currency: "XAF",
    aiConversationsPerMonth: 5_000,
    description: "For high-volume businesses and multiple agents.",
  },
];

/** Included in every plan — keep this list to things the product will actually ship. */
export const planInclusions = [
  "AI replies on your WhatsApp Business number",
  "Products, prices, FAQs and policies",
  "Human takeover at any time",
  "Customer and order records",
  "English and French replies",
];

export function formatXaf(amount: number) {
  return `${new Intl.NumberFormat("en-US").format(amount)} XAF`;
}
