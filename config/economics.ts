import "server-only";

/*
 * Every price, rate, limit and budget WazaBolt runs on — one file.
 *
 * Server-only on purpose: the hidden Claude budgets and our cost rates must
 * never reach the browser. Public plan prices are re-exported for the pricing
 * page by config/plans.ts (a server component).
 *
 * Business model: each business owns its WhatsApp Business Account and pays
 * Meta directly (we are a Tech Provider, not a reseller). Meta rates here are
 * only used to *estimate* what a business will be billed by Meta; they are
 * never charged by us and never shown on sign-up, pricing or onboarding.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
/** Conversion used for every cost shown in FCFA (XAF). */
export const FCFA_PER_USD = 570;
/** Share of each Mobile Money payment the payment provider keeps (approximate). */
export const MOBILE_MONEY_FEE_RATE = 0.03;
/** Minimum gross margin on every paid plan, after Claude costs and payment fees. */
export const MARGIN_TARGET = 0.6;

// ---------------------------------------------------------------------------
// Claude (Anthropic) — USD per million tokens
// ---------------------------------------------------------------------------
export type ClaudeRates = { input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number };

/**
 * Keyed by model alias; a dated id ("claude-haiku-4-5-20251001") matches by prefix.
 * Rates marked "derived" use Anthropic's standard cache multipliers
 * (read 0.1×, 5-minute write 1.25×, 1-hour write 2× the input price).
 */
export const CLAUDE_RATES: Record<string, ClaudeRates> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 /* derived */ },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 /* cache rates derived */ },
  // The model replies ran on before the cost work; kept so their calls are costed correctly.
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 },
};
/** Unknown model ids are costed at the most expensive known rates, so a mistake over-reports. */
export const CLAUDE_FALLBACK_RATES: ClaudeRates = CLAUDE_RATES["claude-opus-5-5"];

/** Customer replies. Env AI_MODEL still overrides (e.g. for a quick rollback). Haiku by default from Step 3. */
export const REPLY_MODEL = "claude-opus-5-5";
/** Sonnet only when explicitly switched on (Step 3). */
export const SONNET_MODEL = "claude-sonnet-5-5";
/** The dashboard test chat. */
export const TEST_CHAT_MODEL = "claude-haiku-4-5";
/** Test-chat messages per business per hour. */
export const TEST_CHAT_PER_HOUR = 10;

// ---------------------------------------------------------------------------
// The reply pipeline
// ---------------------------------------------------------------------------
/** Wait after a customer message so quick follow-ups are answered together, in one reply. */
export const REPLY_DEBOUNCE_MS = 6000;
/** AI replies per conversation before staff take over (Step 4). */
export const MAX_AI_REPLIES_PER_CONVERSATION = 10;

// ---------------------------------------------------------------------------
// Meta (WhatsApp Cloud API) — paid by each business directly, estimates only
// ---------------------------------------------------------------------------
export type WhatsAppCategory = "service" | "utility" | "marketing" | "authentication";

export const META_PRICING = {
  market: "Rest of Africa",
  effectiveFrom: "2026-10-01",
  /**
   * UNVERIFIED: from secondary sources (techweez.com, respond.io,
   * whautomate.com), not Meta's rate card. To be confirmed in Meta Business
   * Suite and updated here.
   */
  verified: false,
  /** Free service messages per business phone number per calendar month (no rollover). */
  freeServicePerNumberPerMonth: 1000,
  /** USD per delivered message, after the free tier for service. */
  ratesUsd: { service: 0.004, utility: 0.004, marketing: 0.0225, authentication: 0.004 } satisfies Record<WhatsAppCategory, number>,
} as const;

/** Free service messages used at which the owner is asked to add a Meta payment method (Step 1). */
export const META_PAYMENT_PROMPT_AT = 800;

// ---------------------------------------------------------------------------
// Plans (customer-facing prices — change only with the owner's approval)
// ---------------------------------------------------------------------------
export type PlanId = "free" | "starter" | "business" | "pro";

export type PlanEconomics = {
  id: PlanId;
  /** FCFA per month. */
  monthlyPrice: number;
  /** AI conversations included per month. Never "unlimited". */
  aiConversationsPerMonth: number;
  highlighted?: boolean;
};

/** Must match the `plans` table (the admin margin page warns when they differ). */
export const PLANS: PlanEconomics[] = [
  // Free goes to 30 conversations with a 300 FCFA budget in Step 4 (approved), together with rules-only fallback.
  { id: "free", monthlyPrice: 0, aiConversationsPerMonth: 50 },
  { id: "starter", monthlyPrice: 10_000, aiConversationsPerMonth: 500 },
  { id: "business", monthlyPrice: 25_000, aiConversationsPerMonth: 2_000, highlighted: true },
  { id: "pro", monthlyPrice: 50_000, aiConversationsPerMonth: 5_000 },
];

/** Annual plans: pay this many months, get 12 (Step 4). */
export const ANNUAL_MONTHS_PAID = 10;

/** Free plan: Claude spend per business per month before it becomes rules-only — counted as acquisition cost. */
export const FREE_PLAN_CLAUDE_BUDGET_FCFA = 300;

/**
 * The most a paid plan may spend on Claude in a month and still keep
 * MARGIN_TARGET after the Mobile Money fee:
 *   price − fee − claude ≥ target × price  ⇒  claude ≤ price × (1 − target − fee)
 */
export function claudeBudgetFcfa(plan: Pick<PlanEconomics, "id" | "monthlyPrice">): number {
  if (plan.monthlyPrice === 0) return FREE_PLAN_CLAUDE_BUDGET_FCFA;
  return Math.floor(plan.monthlyPrice * (1 - MARGIN_TARGET - MOBILE_MONEY_FEE_RATE) + 1e-9);
}
