import {
  ALLOWANCE_ROUNDING,
  ANNUAL_MONTHS_PAID,
  FCFA_PER_USD,
  FREE_PLAN_CLAUDE_BUDGET_FCFA,
  MARGIN_TARGET,
  META_PRICING,
  MOBILE_MONEY_FEE_RATE,
  PRICE_ROUNDING_FCFA,
} from "@/config/economics";

/*
 * Pricing calculator: a plan's price and conversation allowance against the
 * simulated Claude cost per conversation at that volume. Everything is per
 * month, in FCFA, assuming the business uses its whole allowance (the worst
 * case for us).
 *
 *   margin         (price − Mobile Money fee − Claude) ÷ price
 *   annual margin  the same on the annual price (ANNUAL_MONTHS_PAID ÷ 12 per month)
 *   headroom       how many times the simulated cost the plan absorbs before
 *                  falling below MARGIN_TARGET — protection against the
 *                  simulation being too optimistic
 */

export type PlanInput = {
  planId: string;
  /** FCFA per month (0 = Free). */
  price: number;
  conversations: number;
  costPerConversation: number;
  repliesPerConversation: number;
};

export type PlanCheck = PlanInput & {
  claudeAtFullUse: number;
  paymentFees: number;
  /** null for Free (no revenue: its cost is acquisition cost). */
  margin: number | null;
  annualMargin: number | null;
  /** Most Claude may cost a month at MARGIN_TARGET (annual price for paid plans); the Free budget for Free. */
  budget: number;
  headroom: number | null;
  /** Conversations the budget pays for, rounded down to ALLOWANCE_ROUNDING (Free: not rounded). */
  maxConversations: number;
  /** Lowest price keeping MARGIN_TARGET on the annual plan too, for this allowance (rounded up to PRICE_ROUNDING_FCFA). */
  minPrice: number;
  ok: boolean;
  /** What the business's own WhatsApp number would send, and Meta's bill beyond the free service messages (paid by the business). */
  meta: { replies: number; overFree: number; estimateFcfa: number };
};

/** The annual plan's price per month. */
export const annualMonthlyPrice = (price: number) => (price * ANNUAL_MONTHS_PAID) / 12;

const marginOf = (price: number, claude: number) => (price > 0 ? (price - price * MOBILE_MONEY_FEE_RATE - claude) / price : null);
/** Claude cost a monthly price can carry at the target margin. */
const carry = (price: number) => price * (1 - MARGIN_TARGET - MOBILE_MONEY_FEE_RATE);

export function checkPlan(input: PlanInput): PlanCheck {
  const { price, conversations, costPerConversation, repliesPerConversation } = input;
  const claude = conversations * costPerConversation;
  const free = price <= 0;
  // The annual plan earns less per month, so it sets the limit.
  const budget = free ? FREE_PLAN_CLAUDE_BUDGET_FCFA : carry(annualMonthlyPrice(price));
  const fit = costPerConversation > 0 ? budget / costPerConversation : Infinity;
  const margin = marginOf(price, claude);
  const annualMargin = free ? null : marginOf(annualMonthlyPrice(price), claude);
  const replies = Math.round(conversations * repliesPerConversation);
  const overFree = Math.max(0, replies - META_PRICING.freeServicePerNumberPerMonth);
  return {
    ...input,
    claudeAtFullUse: claude,
    paymentFees: price * MOBILE_MONEY_FEE_RATE,
    margin,
    annualMargin,
    budget,
    headroom: claude > 0 ? budget / claude : null,
    maxConversations: Number.isFinite(fit) ? (free ? Math.floor(fit) : Math.floor(fit / ALLOWANCE_ROUNDING) * ALLOWANCE_ROUNDING) : conversations,
    minPrice: free ? 0 : Math.ceil(claude / (1 - MARGIN_TARGET - MOBILE_MONEY_FEE_RATE) / (ANNUAL_MONTHS_PAID / 12) / PRICE_ROUNDING_FCFA) * PRICE_ROUNDING_FCFA,
    ok: free ? claude <= budget : (margin ?? 0) >= MARGIN_TARGET && (annualMargin ?? 0) >= MARGIN_TARGET,
    meta: { replies, overFree, estimateFcfa: overFree * META_PRICING.ratesUsd.service * FCFA_PER_USD },
  };
}

/** One line of advice per plan. Prices only ever change with the owner's approval. */
export function recommendation(c: PlanCheck): string {
  const fmt = (v: number) => new Intl.NumberFormat("en-US").format(Math.round(v));
  if (c.price <= 0) {
    return c.ok
      ? `Fits the ${fmt(c.budget)} FCFA Free budget (covers about ${fmt(c.maxConversations)} conversations).`
      : `Over the ${fmt(c.budget)} FCFA Free budget: it covers about ${fmt(c.maxConversations)} conversations, not ${fmt(c.conversations)}.`;
  }
  if (c.ok) return `Keep ${fmt(c.price)} FCFA for ${fmt(c.conversations)} conversations: room for ${(c.headroom ?? 0).toFixed(1)}× the simulated cost.`;
  return `Below ${Math.round(MARGIN_TARGET * 100)}%: charge at least ${fmt(c.minPrice)} FCFA, or include at most ${fmt(c.maxConversations)} conversations.`;
}
