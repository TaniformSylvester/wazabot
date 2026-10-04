import "server-only";

import {
  AI_CONVERSATION_WINDOW_HOURS,
  ALERTS,
  CACHE_1H_MIN_REPLIES_LAST_HOUR,
  CUSTOMER_AI_REPLIES_PER_HOUR,
  REPLY_DEBOUNCE_MS,
  SAVER_HISTORY_MESSAGES,
  SAVER_RULE_MAX_CHARS,
  claudeBudgetFcfa,
  type PlanId,
} from "@/config/economics";
import { AiNoReplyError, AiRefusalError, ClaudeResponder, aiConfigured, describeAiError } from "@/lib/ai/claude";
import { buildBusinessContext, buildConversationContext, type BusinessContext } from "@/lib/ai/context";
import { isEmojiOnly, spamReason } from "@/lib/ai/filters";
import { answerWithRules } from "@/lib/ai/rules";
import { loadMessageImage, type InputImage } from "@/lib/ai/images";
import { analyzeInboundMessage, fixedMessage } from "@/lib/ai/language";
import { prefetchCatalog, recentTopics } from "@/lib/ai/tools/prefetch";
import { WHATSAPP_TEXT_LIMIT, validateAIResponse, type AiResponder, type AiUsage } from "@/lib/ai/service";
import { sendBudgetAlert } from "@/lib/billing/alerts";
import { claudeCostUsd, logClaudeCalls, usdToFcfa, type ClaudeCallUsage } from "@/lib/billing/costs";
import { decideAllowance, elapsedShare, type Allowance } from "@/lib/billing/guard";
import { getUsageStatus } from "@/lib/billing/usage";
import { isOpenAt } from "@/lib/business/hours";
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappForBusiness, type BusinessWhatsApp } from "@/lib/whatsapp/connection";
import { GraphApiError } from "@/lib/whatsapp/graph";
import { windowOpen } from "@/lib/whatsapp/service";
import { recordWhatsAppSend } from "@/lib/whatsapp/usage";

/*
 * After a customer message is stored: decide whether the assistant answers,
 * generate the reply with Claude, check it, send it on WhatsApp and record it.
 *
 * The assistant stays silent when: AI is switched off for the business (or
 * paused by the WazaBolt team), the conversation is in Human Mode, or a
 * newer customer message arrived (the newest one answers the whole burst).
 * Over the plan's allowance or the hidden Claude budget it answers with
 * rules only and the rest goes to the team (lib/billing/guard.ts). Logs
 * contain ids and reason codes only — never message content.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type AiJob = { businessId: string; conversationId: string; messageId: string };
export type AiOutcome = { outcome: "replied" | "handed_over" | "skipped" | "failed"; reason?: string };

/** Customers often send several short messages in a row; wait briefly and answer the newest. */
const DEBOUNCE_MS = Number(process.env.AI_DEBOUNCE_MS ?? REPLY_DEBOUNCE_MS);
/** Fixed notices (after-hours, handover) are sent at most once per conversation in this window. */
const NOTICE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type PipelineDeps = {
  admin: Admin;
  responder: AiResponder;
  whatsapp: (businessId: string) => Promise<BusinessWhatsApp | null>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** The photo of an inbound image message, once stored (null if unavailable). */
  loadImage: (job: AiJob) => Promise<InputImage | null>;
};

export function defaultDeps(admin: Admin): PipelineDeps {
  return {
    admin,
    responder: new ClaudeResponder(),
    whatsapp: (id) => whatsappForBusiness(id),
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    loadImage: (job) => loadMessageImage(admin, job.businessId, job.messageId, (ms) => new Promise((r) => setTimeout(r, ms))),
  };
}

export async function replyToInbound(job: AiJob, deps: PipelineDeps): Promise<AiOutcome> {
  if (!aiConfigured()) return { outcome: "skipped", reason: "not_configured" };
  const { admin } = deps;
  if (DEBOUNCE_MS > 0) await deps.sleep(DEBOUNCE_MS);

  const { data: latest } = await admin
    .from("messages")
    .select("id")
    .eq("business_id", job.businessId)
    .eq("conversation_id", job.conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.id !== job.messageId) return { outcome: "skipped", reason: "newer_message" };

  const [business, conversation, inbound, conv] = await Promise.all([
    buildBusinessContext(admin, job.businessId, deps.now()),
    buildConversationContext(admin, job.businessId, job.conversationId),
    admin.from("messages").select("id, message_type, content, caption").eq("id", job.messageId).eq("business_id", job.businessId).maybeSingle(),
    admin.from("conversations").select("ai_enabled, last_customer_message_at").eq("id", job.conversationId).eq("business_id", job.businessId).maybeSingle(),
  ]);
  if (!business || !conversation || !inbound.data || !conv.data) return { outcome: "skipped", reason: "not_found" };
  if (!business.settings.aiEnabled) return { outcome: "skipped", reason: "ai_disabled" };
  if (!conv.data.ai_enabled) return { outcome: "skipped", reason: "human_mode" };
  // The WazaBolt team's kill switch: the assistant is silent, the team answers.
  if (await pausedByWazaBolt(admin, job.businessId)) {
    await flagForTeam(admin, job);
    await markProcessed(admin, job, null);
    await logUsage(admin, job, { outcome: "skipped", reason: "admin_paused" });
    return { outcome: "skipped", reason: "admin_paused" };
  }
  if (!windowOpen(conv.data.last_customer_message_at, deps.now().getTime())) return { outcome: "skipped", reason: "window_closed" };

  const wa = await deps.whatsapp(job.businessId);
  if (!wa) return { outcome: "skipped", reason: "whatsapp_not_connected" };

  const ctx = { deps, job, business, wa, customerPhone: conversation.customer.whatsappPhone };
  const message = inbound.data;
  const text = (message.content || message.caption || "").trim();
  const replyLanguage = (lang: LanguageCode | null | undefined) =>
    lang && business.language.enabledLanguages.includes(lang) ? lang : business.language.defaultLanguage;
  const conversationLanguage = replyLanguage(conversation.language ?? conversation.customer.preferredLanguage);

  // Outside opening hours, per the business's choice.
  const open = isOpenAt(business.business.openingHours, business.business.timezone, deps.now());
  if (open === false && business.settings.afterHoursMode !== "reply_normally") {
    const handover = business.settings.afterHoursMode === "handover";
    if (handover) await flagForTeam(admin, job);
    if (await noticeRecentlySent(admin, job, deps.now())) return { outcome: handover ? "handed_over" : "skipped", reason: "after_hours" };
    const notice = handover
      ? fixedMessage(conversationLanguage, "handoff", business.business.name)
      : business.settings.afterHoursMessage || fixedMessage(conversationLanguage, "unavailable", business.business.name);
    return sendNotice(ctx, notice, conversationLanguage, handover ? "handed_over" : "replied", "after_hours");
  }

  // Photos go to the model (Stage 5). Voice notes, documents…: not understood yet — a short notice and the team is flagged.
  const images: InputImage[] = [];
  if (message.message_type === "image" && !business.settings.photoUnderstanding) {
    await flagForTeam(admin, job);
    return sendNotice(ctx, fixedMessage(conversationLanguage, "imagePassedOn", business.business.name), conversationLanguage, "handed_over", "photos_off");
  }
  if (message.message_type === "image") {
    const image = await deps.loadImage(job);
    if (!image) {
      await flagForTeam(admin, job);
      return sendNotice(ctx, fixedMessage(conversationLanguage, "imageNotSupported", business.business.name), conversationLanguage, "handed_over", "image_unavailable");
    }
    images.push(image);
  } else if (message.message_type !== "text") {
    await flagForTeam(admin, job);
    const key = message.message_type === "audio" ? "audioNotSupported" : "attachmentReceived";
    return sendNotice(ctx, fixedMessage(conversationLanguage, key, business.business.name), conversationLanguage, "handed_over", "media_not_supported");
  }
  if (!text && !images.length) return { outcome: "skipped", reason: "empty" };

  // Messages Claude isn't paid to read. Nothing is dropped: they stay in the inbox, and the team is flagged where a person should look.
  if (!images.length) {
    const earlier = conversation.history.slice(0, -1).filter((h) => h.role === "customer");
    const skip = isEmojiOnly(text) ? "emoji_only" : spamReason(text, earlier, deps.now());
    if (skip) {
      if (skip === "too_long" || skip === "links") await flagForTeam(admin, job);
      await markProcessed(admin, job, null);
      await logUsage(admin, job, { outcome: "skipped", reason: skip });
      return { outcome: "skipped", reason: skip };
    }
  }
  // A customer writing non-stop (or a bot): beyond the hourly limit their messages wait for the team.
  if (await overCustomerLimit(admin, job, deps.now())) {
    await flagForTeam(admin, job);
    await markProcessed(admin, job, null);
    await logUsage(admin, job, { outcome: "skipped", reason: "customer_rate_limit" });
    return { outcome: "skipped", reason: "customer_rate_limit" };
  }

  // Language: detection + explicit requests + saved preference → reply language.
  const preference =
    conversation.customer.preferredLanguage && conversation.customer.preferredLanguageSource
      ? { language: conversation.customer.preferredLanguage, source: conversation.customer.preferredLanguageSource as "explicit_request" | "set_by_business" | "inferred" }
      : null;
  const analysis = analyzeInboundMessage(text, { settings: business.language, customerPreference: preference, conversationLanguage: conversation.language });
  if (analysis.decision.preferenceUpdate) {
    await admin
      .from("customers")
      .update({
        preferred_language: analysis.decision.preferenceUpdate.language,
        preferred_language_source: analysis.decision.preferenceUpdate.source,
        preferred_language_updated_at: deps.now().toISOString(),
      })
      .eq("id", conversation.customer.id)
      .eq("business_id", job.businessId);
  }

  const toolCtx = { db: admin, businessId: job.businessId, conversationId: job.conversationId, customerId: conversation.customer.id };
  const catalog = await prefetchCatalog(toolCtx, text, recentTopics(conversation.history)).catch(() => []);

  // The plan's allowance and the hidden Claude budget decide what this reply may cost.
  const guard = await loadGuard(admin, job, deps.now());
  const allowance = guard.allowance;

  // Simple questions (greeting, hours, location, a price…) answered from the business's data — no Claude call.
  if (!images.length) {
    const ruled = answerWithRules({ text, language: analysis.decision.language, business, catalog, maxChars: allowance.mode === "normal" ? undefined : SAVER_RULE_MAX_CHARS });
    if (ruled) {
      const out = await sendNotice(ctx, ruled.text, analysis.decision.language, "replied", `rules_${ruled.intent}`, { model: "rules" });
      if (out.outcome === "replied") await recordReply(admin, job, false);
      return out;
    }
  }
  if (allowance.mode === "rules_only") return holdForTeam(ctx, allowance.reason, conversationLanguage);

  // Budget running ahead of the month: short replies and less history.
  const saver = allowance.mode === "saver";
  const replyBusiness: BusinessContext = saver ? { ...business, settings: { ...business.settings, replyLength: "short" }, style: { ...business.style, replyLength: "short" } } : business;
  const replyConversation =
    saver && conversation.history.length > SAVER_HISTORY_MESSAGES ? { ...conversation, history: conversation.history.slice(-SAVER_HISTORY_MESSAGES), hasEarlier: true } : conversation;

  const cacheTtl = await cacheLifetime(admin, job.businessId, deps.now());
  const started = Date.now();
  const calls: ClaudeCallUsage[] = [];
  try {
    const result = await deps.responder.generate({
      business: replyBusiness,
      conversation: replyConversation,
      decision: analysis.decision,
      detection: analysis.detection,
      now: deps.now(),
      tools: toolCtx,
      images,
      calls,
      cacheTtl,
      catalog,
    });
    const check = validateAIResponse(result.reply, { language: analysis.decision.language, allowedProductIds: result.productIds, maxChars: WHATSAPP_TEXT_LIMIT });
    const issues = check.ok ? [] : check.issues;
    const meta = { model: result.model, usage: result.usage, toolCalls: result.toolCalls, durationMs: Date.now() - started, calls };

    // A product the tools never returned, an empty or invalid reply: don't send it — hand over instead.
    if (issues.some((i) => i !== "language_mismatch")) {
      await flagForTeam(admin, job);
      return sendNotice(ctx, fixedMessage(analysis.decision.language, "handoff", business.business.name), analysis.decision.language, "handed_over", `check_${issues[0]}`, meta);
    }
    if (issues.length) logServerError("ai.reply", { code: "language_mismatch", message: job.messageId });

    const reply = result.reply;
    const handOver = reply.needs_human && business.settings.humanHandoverEnabled;
    const replyLang = isLanguageCode(reply.reply_language) ? reply.reply_language : analysis.decision.language;
    const sent = await sendAssistantMessage(ctx, reply.reply, replyLang, { model: result.model, languageReason: analysis.decision.reason });
    if (handOver) {
      await admin.from("conversations").update({ ai_enabled: false, human_requested: true, status: "pending" }).eq("id", job.conversationId).eq("business_id", job.businessId);
    }
    if (reply.summary?.trim()) {
      await admin
        .from("conversations")
        .update({ ai_summary: reply.summary.trim().slice(0, 800), ai_summary_updated_at: deps.now().toISOString() })
        .eq("id", job.conversationId)
        .eq("business_id", job.businessId);
    }
    await markProcessed(admin, job, sent ? null : "send_failed");
    await logUsage(admin, job, { outcome: sent ? (handOver ? "handed_over" : "replied") : "failed", reason: sent ? (handOver ? "needs_human" : saver ? "saver" : undefined) : "send_failed", replyMessageId: sent ?? undefined, ...meta });
    if (sent) await recordReply(admin, job, true);
    await checkBudgetAlert(admin, job, business, guard, calls);
    return { outcome: sent ? (handOver ? "handed_over" : "replied") : "failed", reason: sent ? undefined : "send_failed" };
  } catch (e) {
    const reason = e instanceof AiRefusalError ? `refusal_${e.category ?? "unknown"}` : e instanceof AiNoReplyError ? e.reason : "api_error";
    logServerError("ai.generate", describeAiError(e));
    await checkBudgetAlert(admin, job, business, guard, calls);
    await flagForTeam(admin, job);
    await markProcessed(admin, job, reason);
    await logUsage(admin, job, { outcome: "failed", reason, durationMs: Date.now() - started, calls, model: calls.at(-1)?.model });
    return { outcome: "failed", reason };
  }
}

type Ctx = { deps: PipelineDeps; job: AiJob; business: BusinessContext; wa: BusinessWhatsApp; customerPhone: string };
type Meta = { model?: string; usage?: AiUsage; toolCalls?: number; durationMs?: number; calls?: ClaudeCallUsage[] };

/** Sends a fixed notice (no model call) and records it. */
async function sendNotice(ctx: Ctx, text: string, language: LanguageCode, outcome: "replied" | "handed_over", reason: string, meta: Meta = {}): Promise<AiOutcome> {
  const sent = await sendAssistantMessage(ctx, text, language, { model: meta.model ?? "fixed", languageReason: null, notice: reason });
  await markProcessed(ctx.deps.admin, ctx.job, sent ? null : "send_failed");
  await logUsage(ctx.deps.admin, ctx.job, { outcome: sent ? outcome : "failed", reason: sent ? reason : "send_failed", replyMessageId: sent ?? undefined, ...meta, model: meta.model ?? "fixed" });
  return { outcome: sent ? outcome : "failed", reason };
}

/** Sends on WhatsApp, then stores the outbound message (sender "ai"). Returns the message id, or null if WhatsApp refused it. */
async function sendAssistantMessage(ctx: Ctx, text: string, language: LanguageCode, meta: { model: string; languageReason: string | null; notice?: string }) {
  const { admin } = ctx.deps;
  const body = text.slice(0, WHATSAPP_TEXT_LIMIT);
  const now = ctx.deps.now().toISOString();
  let wamid: string | null = null;
  let error: string | null = null;
  try {
    wamid = (await ctx.wa.client.sendText(ctx.wa.phoneNumberId, ctx.customerPhone, body)).messageId;
  } catch (e) {
    error = e instanceof GraphApiError ? e.summary : "send failed";
    logServerError("ai.send", e instanceof GraphApiError ? { code: String(e.code ?? e.status), message: e.title } : e);
  }
  const { data } = await admin
    .from("messages")
    .insert({
      business_id: ctx.job.businessId,
      conversation_id: ctx.job.conversationId,
      direction: "outbound",
      sender_type: "ai",
      message_type: "text",
      content: body,
      ai_generated: true,
      ai_model: meta.notice ? `${meta.model}:${meta.notice}`.slice(0, 80) : meta.model,
      language,
      language_reason: meta.languageReason,
      whatsapp_message_id: wamid,
      wa_category: "service",
      delivery_status: wamid ? "sent" : "failed",
      delivery_error: error,
      status_updated_at: now,
      processing_status: "processed",
    })
    .select("id")
    .single();
  if (wamid) await recordWhatsAppSend(admin, ctx.job.businessId, ctx.wa.phoneNumberId, "service");
  await admin.from("conversations").update({ last_message_at: now, language }).eq("id", ctx.job.conversationId).eq("business_id", ctx.job.businessId);
  return wamid ? (data?.id ?? null) : null;
}

async function overCustomerLimit(admin: Admin, job: AiJob, now: Date) {
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", job.businessId)
    .eq("conversation_id", job.conversationId)
    .eq("ai_generated", true)
    .gte("created_at", new Date(now.getTime() - 3_600_000).toISOString());
  return (count ?? 0) >= CUSTOMER_AI_REPLIES_PER_HOUR;
}

/** 1-hour prompt cache for a business that is busy right now; otherwise the cheaper 5-minute one. */
async function cacheLifetime(admin: Admin, businessId: string, now: Date): Promise<"5m" | "1h"> {
  const { count } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .in("outcome", ["replied", "handed_over"])
    .not("conversation_id", "is", null) // customer replies only (test-chat runs have no conversation)
    .gte("created_at", new Date(now.getTime() - 3_600_000).toISOString());
  return (count ?? 0) >= CACHE_1H_MIN_REPLIES_LAST_HOUR ? "1h" : "5m";
}

async function flagForTeam(admin: Admin, job: AiJob) {
  await admin.from("conversations").update({ human_requested: true }).eq("id", job.conversationId).eq("business_id", job.businessId);
}

async function markProcessed(admin: Admin, job: AiJob, error: string | null) {
  await admin
    .from("messages")
    .update({ processing_status: error ? "failed" : "processed", processing_error: error?.slice(0, 80) ?? null })
    .eq("id", job.messageId)
    .eq("business_id", job.businessId)
    .in("processing_status", ["received", "processing"]);
}

async function noticeRecentlySent(admin: Admin, job: AiJob, now: Date) {
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", job.businessId)
    .eq("conversation_id", job.conversationId)
    .eq("sender_type", "ai")
    .like("ai_model", "%:after_hours")
    .gte("created_at", new Date(now.getTime() - NOTICE_COOLDOWN_MS).toISOString());
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Plan allowance, hidden budget, kill switch (Step 4)
// ---------------------------------------------------------------------------
type Guard = { allowance: Allowance; spent: number; budget: number; periodStart: string; planId: string };

async function pausedByWazaBolt(admin: Admin, businessId: string) {
  const { data } = await admin.from("platform_business_controls").select("ai_paused").eq("business_id", businessId).maybeSingle();
  return Boolean(data?.ai_paused);
}

/** Usage this month, this conversation's open 24-hour window and Claude spend → what this reply may cost. */
async function loadGuard(admin: Admin, job: AiJob, now: Date): Promise<Guard> {
  const [status, window] = await Promise.all([
    getUsageStatus(admin, job.businessId, now),
    admin
      .from("ai_conversation_windows")
      .select("claude_replies")
      .eq("business_id", job.businessId)
      .eq("conversation_id", job.conversationId)
      .gt("ends_at", now.toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // No subscription row (shouldn't happen): don't block the business's customers.
  if (!status) return { allowance: { mode: "normal" }, spent: 0, budget: 0, periodStart: now.toISOString(), planId: "free" };
  const [spend, legacy] = await Promise.all([
    admin.rpc("claude_spend_since", { p_business_id: job.businessId, p_since: status.periodStart }),
    status.counting === "legacy"
      ? admin.from("messages").select("id").eq("business_id", job.businessId).eq("conversation_id", job.conversationId).eq("ai_generated", true).gte("created_at", status.periodStart).limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  if (spend.error) logServerError("ai.budget", spend.error);
  const spent = Number(spend.data ?? 0);
  const budget = claudeBudgetFcfa({ id: status.planId as PlanId, monthlyPrice: status.monthlyPrice }, status.interval);
  const allowance = decideAllowance({
    used: status.used,
    limit: status.limit,
    windowClaudeReplies: window.data?.claude_replies ?? null,
    legacyAnswered: Boolean(legacy.data?.length),
    counting: status.counting,
    spent,
    budget,
    elapsed: elapsedShare(status.periodStart, status.periodEnd, now),
  });
  return { allowance, spent, budget, periodStart: status.periodStart, planId: status.planId };
}

/**
 * Nothing the rules could answer, and Claude isn't allowed: the message waits
 * for the team (flagged in the inbox). After MAX_AI_REPLIES_PER_CONVERSATION
 * the conversation is handed over with a short notice; otherwise silently.
 */
async function holdForTeam(ctx: Ctx, reason: Extract<Allowance, { mode: "rules_only" }>["reason"], language: LanguageCode): Promise<AiOutcome> {
  const { admin } = ctx.deps;
  if (reason === "reply_cap") {
    await admin.from("conversations").update({ ai_enabled: false, human_requested: true, status: "pending" }).eq("id", ctx.job.conversationId).eq("business_id", ctx.job.businessId);
    return sendNotice(ctx, fixedMessage(language, "handoff", ctx.business.business.name), language, "handed_over", "reply_cap");
  }
  await flagForTeam(admin, ctx.job);
  await markProcessed(admin, ctx.job, null);
  await logUsage(admin, ctx.job, { outcome: "skipped", reason });
  return { outcome: "skipped", reason };
}

/** Counts the reply in the conversation's 24-hour window (opening one if needed). */
async function recordReply(admin: Admin, job: AiJob, claude: boolean) {
  const { error } = await admin.rpc("record_ai_reply", { p_business_id: job.businessId, p_conversation_id: job.conversationId, p_claude: claude, p_window_hours: AI_CONVERSATION_WINDOW_HOURS });
  if (error) logServerError("ai.window", error);
}

/** Tells the WazaBolt team (once per usage month) when this reply took the business past 80% / 100% of its budget. */
async function checkBudgetAlert(admin: Admin, job: AiJob, business: BusinessContext, guard: Guard, calls: ClaudeCallUsage[]) {
  if (!guard.budget || !calls.length) return;
  const after = guard.spent + usdToFcfa(calls.reduce((n, c) => n + claudeCostUsd(c), 0));
  const crossed = (share: number) => guard.spent < guard.budget * share && after >= guard.budget * share;
  const reached = crossed(1);
  if (!reached && !crossed(ALERTS.budgetShare)) return;
  try {
    await sendBudgetAlert(admin, { businessId: job.businessId, businessName: business.business.name, planId: guard.planId, spent: after, budget: guard.budget, periodStart: guard.periodStart, reached });
  } catch (e) {
    logServerError("ai.budgetAlert", e);
  }
}

async function logUsage(
  admin: Admin,
  job: AiJob,
  u: Meta & { outcome: AiOutcome["outcome"]; reason?: string; replyMessageId?: string },
) {
  const { data, error } = await admin
    .from("ai_usage")
    .insert({
    business_id: job.businessId,
    conversation_id: job.conversationId,
    inbound_message_id: job.messageId,
    reply_message_id: u.replyMessageId ?? null,
    model: (u.model ?? "none").slice(0, 80),
    outcome: u.outcome,
    reason: u.reason?.slice(0, 80) ?? null,
    input_tokens: u.usage?.inputTokens ?? 0,
    output_tokens: u.usage?.outputTokens ?? 0,
    cache_read_tokens: u.usage?.cacheReadTokens ?? 0,
    cache_write_tokens: u.usage?.cacheWriteTokens ?? 0,
    tool_calls: u.toolCalls ?? 0,
    duration_ms: Math.max(0, Math.round(u.durationMs ?? 0)),
    })
    .select("id")
    .single();
  if (error) logServerError("ai.usage", error);
  // Our cost of this attempt, request by request (internal; failed attempts cost money too).
  if (u.calls?.length) await logClaudeCalls(admin, job.businessId, u.calls, { source: "reply", aiUsageId: data?.id ?? null });
}
