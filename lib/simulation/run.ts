import { CACHE_1H_MIN_REPLIES_LAST_HOUR, CUSTOMER_AI_REPLIES_PER_HOUR, HISTORY_MESSAGES, META_PRICING, REPLY_DEBOUNCE_MS, REPLY_MODEL, SIMULATION, SONNET_MODEL } from "@/config/economics";
import { ClaudeResponder } from "@/lib/ai/claude";
import type { ConversationContext } from "@/lib/ai/context";
import { isEmojiOnly, spamReason } from "@/lib/ai/filters";
import { analyzeInboundMessage } from "@/lib/ai/language";
import { answerWithRules } from "@/lib/ai/rules";
import { WHATSAPP_TEXT_LIMIT, validateAIResponse } from "@/lib/ai/service";
import { prefetchCatalog, recentTopics } from "@/lib/ai/tools/prefetch";
import type { ToolContext } from "@/lib/ai/tools/registry";
import { claudeCostUsd, usdToFcfa, type ClaudeCallUsage } from "@/lib/billing/costs";
import type { LanguageCode } from "@/lib/i18n/languages";

import { INDUSTRIES, SIM_BUSINESSES, type Industry, type SimBusiness } from "./businesses";
import { createFakeClaude, type TurnState } from "./fake-claude";
import { memoryDb } from "./memory-db";
import { rng, scriptConversation, type ConversationScript } from "./scripts";

/*
 * Runs scripted customer conversations through the real reply pipeline's
 * decisions, in time order across all conversations of a business:
 *
 *   6-second batching → emoji / repeat / spam skips → per-customer limit →
 *   language decision → catalog prefetch → rules layer → Claude (the real
 *   ClaudeResponder: prompt, cache lifetime, tool loop, summary) → reply check
 *   → send (or hand over to the team).
 *
 * Only the edges are replaced: the database by sample businesses in memory,
 * the Messages API by a stand-in that counts the real request's tokens
 * (lib/simulation/fake-claude.ts), WhatsApp by a counter. The pipeline's own
 * database checks (lib/ai/pipeline.ts) are mirrored here; keep them in step.
 */

export type ConversationResult = {
  industry: Industry;
  language: LanguageCode;
  flow: string;
  customerMessages: number;
  /** Messages the assistant sent (rules, Claude, hand-over notices). */
  replies: number;
  rulesReplies: number;
  claudeReplies: number;
  claudeRequests: number;
  cacheReadRequests: number;
  skipped: Record<string, number>;
  handedOver: boolean;
  checkFailures: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number };
  costUsd: number;
  /** The same requests priced at Sonnet's rates (USE_SONNET_FOR_REPLIES). */
  sonnetCostUsd: number;
};

type SimConversation = { id: number; sim: SimBusiness; script: ConversationScript; start: number };
type Line = { role: "customer" | "assistant"; text: string; at: string };

const SIM_START = Date.UTC(2026, 9, 5); // a Monday
const DOUALA_UTC_OFFSET_H = 1;

/** Conversations for one business, starting at random times within its busy hours over `days` days. */
export function scriptConversations(sim: SimBusiness, count: number, days: number, seed: number, firstId = 0): SimConversation[] {
  const r = rng(seed);
  const [open, close] = sim.trafficHours;
  return Array.from({ length: count }, (_, i) => {
    const day = Math.floor(r.next() * days);
    const hour = r.between(open, close - 0.5) - DOUALA_UTC_OFFSET_H;
    return { id: firstId + i, sim, script: scriptConversation(sim, r), start: SIM_START + day * 86_400_000 + hour * 3_600_000 };
  });
}

export async function simulate(conversations: SimConversation[], seed: number): Promise<ConversationResult[]> {
  const r = rng(seed ^ 0x5eed);
  const state: { turn: TurnState | null } = { turn: null };
  const responder = new ClaudeResponder(createFakeClaude(state), REPLY_MODEL);
  const dbs = new Map<string, ToolContext["db"]>();
  const businessReplies = new Map<string, number[]>();
  let clock = SIM_START;

  const convs = conversations.map((c) => {
    let t = c.start;
    const at = c.script.steps.map((s) => (t += s.gapSec * 1000));
    return {
      c,
      at,
      history: [] as Line[],
      appended: 0,
      summary: null as string | null,
      language: null as LanguageCode | null,
      aiEnabled: true,
      result: {
        industry: c.sim.industry,
        language: c.script.language,
        flow: c.script.flow,
        customerMessages: c.script.steps.length,
        replies: 0,
        rulesReplies: 0,
        claudeReplies: 0,
        claudeRequests: 0,
        cacheReadRequests: 0,
        skipped: {},
        handedOver: false,
        checkFailures: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
        costUsd: 0,
        sonnetCostUsd: 0,
      } satisfies ConversationResult as ConversationResult,
    };
  });

  // Each customer message is looked at once the batching wait is over, in time order across all conversations.
  const events = convs.flatMap((s) => s.at.map((t, i) => ({ s, i, t: t + REPLY_DEBOUNCE_MS }))).sort((a, b) => a.t - b.t || a.s.c.id - b.s.c.id);

  for (const { s, i, t } of events) {
    clock = t;
    const now = new Date(t);
    const { sim, script } = s.c;
    const business = sim.context;
    const step = script.steps[i];
    const skip = (reason: string) => void (s.result.skipped[reason] = (s.result.skipped[reason] ?? 0) + 1);
    const replies = businessReplies.get(business.business.id) ?? [];
    businessReplies.set(business.business.id, replies);
    const send = (text: string) => {
      s.history.push({ role: "assistant", text, at: now.toISOString() });
      s.result.replies++;
      replies.push(t);
    };

    for (; s.appended <= i; s.appended++) s.history.push({ role: "customer", text: script.steps[s.appended].text, at: new Date(s.at[s.appended]).toISOString() });
    // A newer message arrived during the wait: that one answers the whole burst.
    if (i + 1 < s.at.length && s.at[i + 1] <= t) {
      skip("newer_message");
      continue;
    }
    if (!s.aiEnabled) {
      skip("human_mode");
      continue;
    }
    const text = step.text.trim();
    const earlier = s.history.slice(0, -1).filter((h) => h.role === "customer");
    const cheap = isEmojiOnly(text) ? "emoji_only" : spamReason(text, earlier, now);
    if (cheap) {
      skip(cheap);
      continue;
    }
    const lastHour = s.history.filter((h) => h.role === "assistant" && new Date(h.at).getTime() >= t - 3_600_000).length;
    if (lastHour >= CUSTOMER_AI_REPLIES_PER_HOUR) {
      skip("customer_rate_limit");
      continue;
    }

    const analysis = analyzeInboundMessage(text, { settings: business.language, conversationLanguage: s.language });
    const language = analysis.decision.language;
    if (!dbs.has(business.business.id)) dbs.set(business.business.id, memoryDb(sim, () => new Date(clock)));
    const tools: ToolContext = { db: dbs.get(business.business.id)!, businessId: business.business.id, conversationId: `sim-${s.c.id}`, customerId: null, dryRun: true };
    const catalog = await prefetchCatalog(tools, text, recentTopics(s.history)).catch(() => []);

    const ruled = answerWithRules({ text, language, business, catalog });
    if (ruled) {
      send(ruled.text);
      s.result.rulesReplies++;
      s.language = language;
      continue;
    }

    const cacheTtl = replies.filter((x) => x >= t - 3_600_000).length >= CACHE_1H_MIN_REPLIES_LAST_HOUR ? "1h" : "5m";
    const handOver = step.kind === "complaint" || (step.kind === "visit" && r.chance(0.5));
    state.turn = {
      now,
      business: business.business.id,
      language,
      kind: step.kind,
      replyLength: business.style.replyLength,
      catalog,
      serviceId: business.booking.services.find((x) => x.name.toLowerCase() === sim.services.find((n) => text.toLowerCase().includes(n))?.toLowerCase())?.id ?? business.booking.services[0]?.id ?? null,
      handOver,
      pick: r.pick,
    };
    const conversation: ConversationContext = {
      conversationId: `sim-${s.c.id}`,
      aiEnabled: true,
      language: s.language,
      customer: { id: `sim-customer-${s.c.id}`, whatsappPhone: "237670000000", name: "", city: null, preferredLanguage: null, preferredLanguageSource: null, tags: [] },
      history: s.history.slice(-HISTORY_MESSAGES),
      hasEarlier: s.history.length > HISTORY_MESSAGES,
      summary: s.summary,
    };
    const calls: ClaudeCallUsage[] = [];
    const result = await responder.generate({ business, conversation, decision: analysis.decision, detection: analysis.detection, now, tools, images: [], calls, cacheTtl, catalog });
    for (const call of calls) {
      s.result.claudeRequests++;
      if (call.cacheReadTokens) s.result.cacheReadRequests++;
      s.result.tokens.input += call.inputTokens;
      s.result.tokens.output += call.outputTokens;
      s.result.tokens.cacheRead += call.cacheReadTokens;
      s.result.tokens.cacheWrite5m += call.cacheWrite5mTokens;
      s.result.tokens.cacheWrite1h += call.cacheWrite1hTokens;
      s.result.costUsd += claudeCostUsd(call);
      s.result.sonnetCostUsd += claudeCostUsd({ ...call, model: SONNET_MODEL });
    }
    const check = validateAIResponse(result.reply, { language, allowedProductIds: result.productIds, maxChars: WHATSAPP_TEXT_LIMIT });
    if (!check.ok && check.issues.some((x) => x !== "language_mismatch")) s.result.checkFailures++;
    send(result.reply.reply);
    s.result.claudeReplies++;
    s.language = language;
    if (result.reply.summary?.trim()) s.summary = result.reply.summary.trim();
    if (result.reply.needs_human && business.settings.humanHandoverEnabled) {
      s.aiEnabled = false;
      s.result.handedOver = true;
    }
  }
  return convs.map((s) => s.result);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export type SimulationSummary = {
  conversations: number;
  customerMessages: number;
  replies: number;
  repliesPerConversation: number;
  maxReplies: number;
  /** Share of conversations with 4 or fewer assistant messages. */
  within4Replies: number;
  /** Rules replies ÷ (rules + Claude replies). */
  rulesShare: number;
  claudeRequests: number;
  claudeRequestsPerReply: number;
  /** Per Claude request, averages. */
  tokensPerRequest: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** Requests that read the cached prefix ÷ requests. */
  cacheHitRate: number;
  costPerConversationFcfa: { mean: number; p50: number; p90: number; max: number };
  sonnetCostPerConversationFcfa: number;
  handedOver: number;
  checkFailures: number;
  skipped: Record<string, number>;
  /** Conversations a month before a business's number uses up Meta's free service messages (assistant messages only; the team's replies count too). */
  conversationsWithinMetaFree: number;
  byIndustry: Record<string, { conversations: number; costPerConversationFcfa: number; repliesPerConversation: number; rulesShare: number }>;
  byLanguage: Record<string, number>;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

export function summarize(results: ConversationResult[]): SimulationSummary {
  const n = results.length || 1;
  const replies = sum(results.map((x) => x.replies));
  const rules = sum(results.map((x) => x.rulesReplies));
  const claude = sum(results.map((x) => x.claudeReplies));
  const requests = sum(results.map((x) => x.claudeRequests));
  const costs = results.map((x) => usdToFcfa(x.costUsd)).sort((a, b) => a - b);
  const skipped: Record<string, number> = {};
  for (const x of results) for (const [k, v] of Object.entries(x.skipped)) skipped[k] = (skipped[k] ?? 0) + v;
  const tok = (f: (x: ConversationResult) => number) => (requests ? sum(results.map(f)) / requests : 0);
  const byIndustry: SimulationSummary["byIndustry"] = {};
  for (const industry of INDUSTRIES) {
    const rows = results.filter((x) => x.industry === industry);
    if (!rows.length) continue;
    const r = sum(rows.map((x) => x.rulesReplies));
    const c = sum(rows.map((x) => x.claudeReplies));
    byIndustry[industry] = {
      conversations: rows.length,
      costPerConversationFcfa: usdToFcfa(sum(rows.map((x) => x.costUsd))) / rows.length,
      repliesPerConversation: sum(rows.map((x) => x.replies)) / rows.length,
      rulesShare: r + c ? r / (r + c) : 0,
    };
  }
  const byLanguage: Record<string, number> = {};
  for (const x of results) byLanguage[x.language] = (byLanguage[x.language] ?? 0) + 1;
  const repliesPerConversation = replies / n;
  return {
    conversations: results.length,
    customerMessages: sum(results.map((x) => x.customerMessages)),
    replies,
    repliesPerConversation,
    maxReplies: Math.max(0, ...results.map((x) => x.replies)),
    within4Replies: results.filter((x) => x.replies <= 4).length / n,
    rulesShare: rules + claude ? rules / (rules + claude) : 0,
    claudeRequests: requests,
    claudeRequestsPerReply: claude ? requests / claude : 0,
    tokensPerRequest: {
      input: tok((x) => x.tokens.input),
      output: tok((x) => x.tokens.output),
      cacheRead: tok((x) => x.tokens.cacheRead),
      cacheWrite: tok((x) => x.tokens.cacheWrite5m + x.tokens.cacheWrite1h),
    },
    cacheHitRate: requests ? sum(results.map((x) => x.cacheReadRequests)) / requests : 0,
    costPerConversationFcfa: { mean: sum(costs) / n, p50: quantile(costs, 0.5), p90: quantile(costs, 0.9), max: costs.at(-1) ?? 0 },
    sonnetCostPerConversationFcfa: usdToFcfa(sum(results.map((x) => x.sonnetCostUsd))) / n,
    handedOver: results.filter((x) => x.handedOver).length,
    checkFailures: sum(results.map((x) => x.checkFailures)),
    skipped,
    conversationsWithinMetaFree: repliesPerConversation ? Math.floor(META_PRICING.freeServicePerNumberPerMonth / repliesPerConversation) : 0,
    byIndustry,
    byLanguage,
  };
}

/** The general report: SIMULATION.conversations spread over the four sample businesses, over 30 days. */
export async function runGeneralSimulation(seed: number = SIMULATION.seed) {
  const per = Math.ceil(SIMULATION.conversations / INDUSTRIES.length);
  const conversations = INDUSTRIES.flatMap((industry, k) => scriptConversations(SIM_BUSINESSES[industry], per, 30, seed + k, k * per)).slice(0, SIMULATION.conversations);
  return summarize(await simulate(conversations, seed));
}

export type VolumeResult = {
  conversationsPerMonth: number;
  byIndustry: Record<Industry, { conversations: number; costPerConversationFcfa: number; repliesPerConversation: number; cacheHitRate: number }>;
  /** The most expensive industry at this volume: what prices are checked against. */
  worst: { industry: Industry; costPerConversationFcfa: number; repliesPerConversation: number };
};

/**
 * One business of each industry running at `conversationsPerMonth` for
 * SIMULATION.planSampleDays days: the cost per conversation at that volume
 * (the busier the business, the more replies reuse the prompt cache).
 */
export async function runVolumeSimulation(conversationsPerMonth: number, seed: number = SIMULATION.seed): Promise<VolumeResult> {
  const days = SIMULATION.planSampleDays;
  const count = Math.max(4, Math.round((conversationsPerMonth / 30) * days));
  const byIndustry = {} as VolumeResult["byIndustry"];
  for (const [k, industry] of INDUSTRIES.entries()) {
    const results = await simulate(scriptConversations(SIM_BUSINESSES[industry], count, days, seed + 100 + k), seed + k);
    const s = summarize(results);
    byIndustry[industry] = { conversations: results.length, costPerConversationFcfa: s.costPerConversationFcfa.mean, repliesPerConversation: s.repliesPerConversation, cacheHitRate: s.cacheHitRate };
  }
  const worstIndustry = INDUSTRIES.reduce((a, b) => (byIndustry[b].costPerConversationFcfa > byIndustry[a].costPerConversationFcfa ? b : a));
  return {
    conversationsPerMonth,
    byIndustry,
    worst: { industry: worstIndustry, costPerConversationFcfa: byIndustry[worstIndustry].costPerConversationFcfa, repliesPerConversation: byIndustry[worstIndustry].repliesPerConversation },
  };
}
