import "server-only";

import { REPLY_DEBOUNCE_MS } from "@/config/economics";
import { AiNoReplyError, AiRefusalError, ClaudeResponder, aiConfigured, describeAiError } from "@/lib/ai/claude";
import { buildBusinessContext, buildConversationContext, type BusinessContext } from "@/lib/ai/context";
import { loadMessageImage, type InputImage } from "@/lib/ai/images";
import { analyzeInboundMessage, fixedMessage } from "@/lib/ai/language";
import { WHATSAPP_TEXT_LIMIT, validateAIResponse, type AiResponder, type AiUsage } from "@/lib/ai/service";
import { logClaudeCalls, type ClaudeCallUsage } from "@/lib/billing/costs";
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
 * The assistant stays silent when: AI is switched off for the business,
 * the conversation is in Human Mode, a newer customer message arrived (the
 * newest one answers the whole burst), or the plan's monthly AI allowance
 * is used up (the team is flagged instead). Logs contain ids and reason
 * codes only — never message content.
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
  if (!windowOpen(conv.data.last_customer_message_at, deps.now().getTime())) return { outcome: "skipped", reason: "window_closed" };

  const wa = await deps.whatsapp(job.businessId);
  if (!wa) return { outcome: "skipped", reason: "whatsapp_not_connected" };

  const ctx = { deps, job, business, wa, customerPhone: conversation.customer.whatsappPhone };
  const message = inbound.data;
  const text = (message.content || message.caption || "").trim();
  const replyLanguage = (lang: LanguageCode | null | undefined) =>
    lang && business.language.enabledLanguages.includes(lang) ? lang : business.language.defaultLanguage;
  const conversationLanguage = replyLanguage(conversation.language ?? conversation.customer.preferredLanguage);

  // Monthly AI allowance (plans table): a new conversation over the limit goes to the team.
  if (!(await withinPlanLimit(admin, job))) {
    await flagForTeam(admin, job);
    await logUsage(admin, job, { outcome: "skipped", reason: "plan_limit" });
    return { outcome: "skipped", reason: "plan_limit" };
  }

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

  const started = Date.now();
  const calls: ClaudeCallUsage[] = [];
  try {
    const result = await deps.responder.generate({
      business,
      conversation,
      decision: analysis.decision,
      detection: analysis.detection,
      now: deps.now(),
      tools: { db: admin, businessId: job.businessId, conversationId: job.conversationId, customerId: conversation.customer.id },
      images,
      calls,
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
    await markProcessed(admin, job, sent ? null : "send_failed");
    await logUsage(admin, job, { outcome: sent ? (handOver ? "handed_over" : "replied") : "failed", reason: sent ? (handOver ? "needs_human" : undefined) : "send_failed", replyMessageId: sent ?? undefined, ...meta });
    return { outcome: sent ? (handOver ? "handed_over" : "replied") : "failed", reason: sent ? undefined : "send_failed" };
  } catch (e) {
    const reason = e instanceof AiRefusalError ? `refusal_${e.category ?? "unknown"}` : e instanceof AiNoReplyError ? e.reason : "api_error";
    logServerError("ai.generate", describeAiError(e));
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

/** AI conversations this month vs. the plan's allowance. An ongoing AI conversation always continues. */
async function withinPlanLimit(admin: Admin, job: AiJob) {
  const status = await getUsageStatus(admin, job.businessId);
  if (!status || status.used < status.limit) return true;
  // Over the allowance: conversations already answered this month keep their assistant.
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("business_id", job.businessId)
    .eq("conversation_id", job.conversationId)
    .eq("ai_generated", true)
    .gte("created_at", status.periodStart)
    .limit(1);
  return Boolean(data?.length);
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
