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

/** Sonnet 5.5 for customer replies instead of Haiku — off; only switch on deliberately (it costs ~2× Haiku). */
export const USE_SONNET_FOR_REPLIES = false;
export const SONNET_MODEL = "claude-sonnet-5-5";
/** Customer replies. Env AI_MODEL still overrides (e.g. for a quick rollback). */
export const REPLY_MODEL = USE_SONNET_FOR_REPLIES ? SONNET_MODEL : "claude-haiku-4-5";
/** The dashboard test chat. */
export const TEST_CHAT_MODEL = "claude-haiku-4-5";
/** Test-chat messages per business per hour. */
export const TEST_CHAT_PER_HOUR = 10;

// ---------------------------------------------------------------------------
// The reply pipeline
// ---------------------------------------------------------------------------
/** Wait after a customer message so quick follow-ups are answered together, in one reply. */
export const REPLY_DEBOUNCE_MS = 6000;
/**
 * Output cap per Claude request, by the business's reply-length setting. Only
 * generated tokens are billed, so the cap costs nothing unless used; it is
 * sized so a reply of that length (with the send_reply fields) is never cut
 * off — measured in tests/unit/reply-budget.test.ts.
 */
export const MAX_OUTPUT_TOKENS = { short: 300, medium: 450, detailed: 700 } as const;
/** Messages of the conversation sent with each request; older ones are carried by a running summary. */
export const HISTORY_MESSAGES = 6;
/**
 * The business's FAQs and policies kept in the cached prompt (characters, by
 * priority; ≈3,300 tokens). A larger knowledge base sends the rest only when
 * relevant to the customer's message (KNOWLEDGE_EXTRA_ITEMS at most).
 */
export const KNOWLEDGE_CACHED_CHARS = 12_000;
export const KNOWLEDGE_EXTRA_ITEMS = 3;
/** Products matching the conversation, looked up before the model runs so most replies need one call. */
export const PREFETCH_PRODUCTS = 8;
/**
 * Prompt cache lifetime: 5 minutes by default; 1 hour for a business that is
 * busy right now (this many AI replies in the past hour), so the cache
 * survives the gaps between its customers' messages.
 */
export const CACHE_1H_MIN_REPLIES_LAST_HOUR = 3;
/**
 * Messages that never reach Claude: emoji-only, stickers and reactions
 * (ignored on arrival), the same text repeated within REPEAT_WINDOW_MINUTES,
 * very long pastes and link floods (spam → the team sees them in the inbox).
 */
export const REPEAT_WINDOW_MINUTES = 10;
export const SPAM_MAX_CHARS = 2000;
export const SPAM_MAX_LINKS = 3;
/** AI replies per customer per hour; beyond that their messages wait for the team (never dropped). */
export const CUSTOMER_AI_REPLIES_PER_HOUR = 15;
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
  // Free: 30 conversations and a 300 FCFA Claude budget, then rules-only (businesses that signed up before Step 4: 50 until 1 Nov 2026).
  { id: "free", monthlyPrice: 0, aiConversationsPerMonth: 30 },
  { id: "starter", monthlyPrice: 10_000, aiConversationsPerMonth: 500 },
  { id: "business", monthlyPrice: 25_000, aiConversationsPerMonth: 2_000, highlighted: true },
  { id: "pro", monthlyPrice: 50_000, aiConversationsPerMonth: 5_000 },
];

/** Annual plans: pay this many months, get 12. */
export const ANNUAL_MONTHS_PAID = 10;
export type BillingInterval = "month" | "year";
/** What a plan costs for one billing period. */
export const periodPrice = (monthlyPrice: number, interval: BillingInterval) => (interval === "year" ? monthlyPrice * ANNUAL_MONTHS_PAID : monthlyPrice);

/** Free plan: Claude spend per business per month before it becomes rules-only — counted as acquisition cost. */
export const FREE_PLAN_CLAUDE_BUDGET_FCFA = 300;

/**
 * The most a paid plan may spend on Claude in a month and still keep
 * MARGIN_TARGET after the Mobile Money fee:
 *   price − fee − claude ≥ target × price  ⇒  claude ≤ price × (1 − target − fee)
 */
export function claudeBudgetFcfa(plan: Pick<PlanEconomics, "id" | "monthlyPrice">, interval: BillingInterval = "month"): number {
  if (plan.monthlyPrice === 0) return FREE_PLAN_CLAUDE_BUDGET_FCFA;
  // An annual plan earns less per month (ANNUAL_MONTHS_PAID ÷ 12), so its monthly budget is smaller.
  const perMonth = interval === "year" ? (plan.monthlyPrice * ANNUAL_MONTHS_PAID) / 12 : plan.monthlyPrice;
  return Math.floor(perMonth * (1 - MARGIN_TARGET - MOBILE_MONEY_FEE_RATE) + 1e-9);
}

// ---------------------------------------------------------------------------
// Protecting the margin (Step 4)
// ---------------------------------------------------------------------------
/** One AI conversation = one customer's window of this many hours in which Claude replied. */
export const AI_CONVERSATION_WINDOW_HOURS = 24;
/**
 * Claude budget pacing, per business and usage month (share of the hidden budget):
 *   saver     from BUDGET_SAVER_AT, or earlier when spending faster than the month
 *             (once BUDGET_PACE_MIN_SHARE is spent): short replies, less history
 *   handover  from BUDGET_HANDOVER_AT: new conversations go to the team; ongoing ones continue
 *   limit     at 100%: rules only, everything else goes to the team (never dropped)
 */
export const BUDGET_SAVER_AT = 0.8;
export const BUDGET_PACE_MIN_SHARE = 0.2;
export const BUDGET_HANDOVER_AT = 0.95;
/** History sent to Claude in saver mode (normally HISTORY_MESSAGES). */
export const SAVER_HISTORY_MESSAGES = 4;
/** In saver mode the rules layer also answers somewhat longer messages (normally 160 characters). */
export const SAVER_RULE_MAX_CHARS = 240;

/** Prepaid billing: reminders this many days before a paid period ends; then this many days of grace before Free. */
export const RENEWAL_REMINDER_DAYS = [5, 1] as const;
export const PAYMENT_GRACE_DAYS = 3;

/** Alerts to the WazaBolt team (email to the team inbox). */
export const ALERTS = {
  /** Yesterday's Claude spend (all businesses) above the day before by more than this share… */
  dailySpendJump: 0.3,
  /** …and at least this many FCFA (small numbers jump easily). */
  dailySpendMinFcfa: 200,
  /** A business has used this share of its hidden Claude budget. */
  budgetShare: 0.8,
} as const;

// ---------------------------------------------------------------------------
// Simulation and pricing calculator (admin → Pricing, tests/unit/simulation.test.ts)
// ---------------------------------------------------------------------------
export const SIMULATION = {
  /** Conversations in the general report (spread evenly over the four sample businesses). */
  conversations: 1000,
  /** Same seed → same conversations → same report. */
  seed: 20261004,
  /** Days of traffic simulated per plan, at the plan's full monthly allowance (busier businesses reuse the prompt cache more). */
  planSampleDays: 3,
  /**
   * No tokenizer offline: tokens are estimated from characters, on the
   * expensive side (French, JSON and ids tokenize densely). Replace with
   * measured figures from claude_calls once real traffic flows.
   */
  inputCharsPerToken: 3.2,
  outputCharsPerToken: 3,
  /** Haiku caches a prompt prefix only from this many tokens. */
  minCacheableTokens: 4096,
} as const;

/** Recommended prices are rounded up to this many FCFA, recommended allowances down to this many conversations. */
export const PRICE_ROUNDING_FCFA = 500;
export const ALLOWANCE_ROUNDING = 50;
