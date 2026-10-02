import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { REPLY_MODEL } from "@/config/economics";
import type { ConversationContext } from "@/lib/ai/context";
import { buildBusinessPrompt, buildKnowledgePrompt, buildPlatformPrompt, buildTurnContext } from "@/lib/ai/prompts/system-prompt";
import { assistantReplySchema, type AssistantReply } from "@/lib/ai/reply-schema";
import type { AiResponder, AiUsage, GenerateInput, GenerateResult } from "@/lib/ai/service";
import type { InputImage } from "@/lib/ai/images";
import { runTool, toolSchemas, type ProductPhoto } from "@/lib/ai/tools/registry";
import { isOpenAt } from "@/lib/business/hours";
import { languages } from "@/lib/i18n/languages";

/*
 * WhatsApp replies with Claude (Messages API + our own tools), server-side
 * only. One customer message → a short tool loop:
 *
 *   system  [platform rules · cached] [business + knowledge · cached]
 *   tools   catalog/order/handover tools + send_reply (sorted, stable → cached)
 *   messages  conversation history … latest customer message,
 *             then this turn's language decision, local time and customer
 *             profile — a mid-conversation system message where the model
 *             supports it, else a text block in the customer's turn (Haiku).
 *
 * The model looks things up with tools and must finish by calling send_reply
 * with the structured reply. Tools only ever touch the current business
 * (lib/ai/tools/registry.ts); the model never sees the database.
 */

export const AI_MODEL = process.env.AI_MODEL || REPLY_MODEL;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
/** WhatsApp chat is latency-sensitive and short; raise with AI_EFFORT if answers need more care. */
export const AI_EFFORT: (typeof EFFORTS)[number] = (EFFORTS as readonly string[]).includes(process.env.AI_EFFORT ?? "")
  ? (process.env.AI_EFFORT as (typeof EFFORTS)[number])
  : "low";
const MAX_STEPS = 8;
const MAX_TOOL_RESULT_CHARS = 8000;

/**
 * What a model's request may carry. Haiku 4.5 takes no effort setting, no
 * mid-conversation system messages and no server-side fallback; it runs
 * without extended thinking.
 */
export function modelFeatures(model: string) {
  const current = /^claude-(opus|sonnet)-5-5/.test(model);
  return { effort: current, systemMessages: current, fallback: current };
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** The model declined (safety classifier) and the server-side fallback declined too. */
export class AiRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`model refused (${category ?? "unknown"})`);
    this.name = "AiRefusalError";
  }
}

/**
 * Safe summary of an AI failure for logs: HTTP status + Anthropic error type
 * and message (about the request, e.g. "invalid model"), never customer text.
 */
export function describeAiError(e: unknown): { code: string; message: string } {
  if (e instanceof AiRefusalError) return { code: "refusal", message: e.category ?? "unknown" };
  if (e instanceof AiNoReplyError) return { code: e.reason, message: "" };
  if (e instanceof Anthropic.APIError) {
    const body = e.error as { error?: { type?: string; message?: string } } | undefined;
    return { code: `api_${e.status ?? "network"}`, message: `${body?.error?.type ?? e.name}: ${body?.error?.message ?? ""}`.slice(0, 300) };
  }
  return { code: "error", message: e instanceof Error ? e.name : "unknown" };
}

/** The loop ended without a usable reply (no send_reply, truncated, too many steps). */
export class AiNoReplyError extends Error {
  constructor(readonly reason: "max_tokens" | "max_steps" | "no_reply") {
    super(`no reply: ${reason}`);
    this.name = "AiNoReplyError";
  }
}

const replyInputSchema = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(assistantReplySchema) as Record<string, unknown>;
  void _ignored;
  return { ...schema, type: "object" as const, additionalProperties: false };
})();

const SEND_REPLY: Anthropic.Beta.BetaTool = {
  name: "send_reply",
  description:
    "Send your WhatsApp message to the customer and finish this turn. Call it exactly once, after any lookups, as your last action. " +
    "Fill every field: reply (the message text, in the reply language), reply_language, customer_languages, language_request, " +
    "catalog_product_ids (ids from tool results whose details you state), needs_human and handoff_reason.",
  input_schema: replyInputSchema as Anthropic.Beta.BetaTool.InputSchema,
};

const BOOKING_TOOLS = new Set(["findAvailableSlots", "bookAppointment", "getMyAppointments", "cancelAppointment"]);

/**
 * Every tool the assistant may call, in a fixed order (tools render first in the prompt; a stable order keeps the cache valid).
 * Without photo understanding, the catalog-photo tool is left out; appointment tools only when booking is on.
 */
export function assistantTools(photos = true, booking = false): Anthropic.Beta.BetaTool[] {
  return [
    ...toolSchemas()
      .filter((t) => photos || t.name !== "viewProductPhotos")
      .filter((t) => booking || !BOOKING_TOOLS.has(t.name))
      .map((t) => ({ ...t, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema })),
    SEND_REPLY,
  ];
}

/** Conversation history → Messages API turns. Team replies are marked so the model knows a person answered. */
export function historyToMessages(conversation: ConversationContext): Anthropic.Beta.BetaMessageParam[] {
  const turns: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of conversation.history) {
    const role = h.role === "customer" ? "user" : "assistant";
    const text = h.role === "agent" ? `[Reply from a team member]\n${h.text}` : h.text;
    const last = turns.at(-1);
    // Same-role turns are merged so roles alternate cleanly.
    if (last && last.role === role && typeof last.content === "string") last.content = `${last.content}\n\n${text}`;
    else turns.push({ role, content: text });
  }
  // The API needs the first turn to be the customer's.
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

/** Per-turn operator context: language decision, local time / open now, the customer's saved details. */
export function buildTurnMessage(input: GenerateInput): string {
  const { business, conversation, decision, detection, now } = input;
  const b = business.business;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: b.timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const open = isOpenAt(b.openingHours, b.timezone, now);
  const firstContact = conversation.history.filter((h) => h.role !== "customer").length === 0;
  const c = conversation.customer;
  const customer = [
    `name: ${c.name || "unknown"}`,
    c.city ? `city: ${c.city}` : null,
    c.preferredLanguage ? `saved language: ${languages[c.preferredLanguage].englishName}` : null,
    c.tags.length ? `tags: ${c.tags.join(", ")}` : null,
  ].filter(Boolean);
  return [
    buildTurnContext(decision, detection, business.style),
    `<now>\nlocal_time: ${local} (${b.timezone})\nbusiness_open_now: ${open === null ? "unknown (opening hours not set)" : open ? "yes" : "no"}\n</now>`,
    `<customer>\n${customer.join("\n")}\nfirst_message_in_conversation: ${firstContact ? "yes" : "no"}\n</customer>`,
  ].join("\n\n");
}

type CreateFn = (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;

export class ClaudeResponder implements AiResponder {
  private readonly create: CreateFn;

  constructor(
    create?: CreateFn,
    private readonly model = AI_MODEL,
    private readonly effort = AI_EFFORT,
  ) {
    if (create) this.create = create;
    else {
      // Credentials come from ANTHROPIC_API_KEY (server environment only).
      const client = new Anthropic({ timeout: 45_000, maxRetries: 2 });
      this.create = (params) => client.beta.messages.create(params);
    }
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const { business } = input;
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: buildPlatformPrompt(), cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: `${buildBusinessPrompt({ name: business.business.name, countryCode: business.business.countryCode }, business.language, business.style)}\n\n${buildKnowledgePrompt(business)}`,
        cache_control: { type: "ephemeral" },
      },
    ];
    const tools = assistantTools(business.settings.photoUnderstanding, business.booking.enabled);
    const features = modelFeatures(this.model);
    const turns = withImages(historyToMessages(input.conversation), input.images ?? []);
    const messages: Anthropic.Beta.BetaMessageParam[] = features.systemMessages
      ? [...turns, { role: "system", content: buildTurnMessage(input) }]
      : withTurnContext(turns, buildTurnMessage(input));

    const usage: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const productIds = new Set<string>();
    const toolLog: string[] = [];
    let toolCalls = 0;
    let model = this.model;

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await this.create({
        model: this.model,
        max_tokens: 8000,
        ...(features.effort ? { output_config: { effort: this.effort } } : {}),
        // Opt-in server-side fallback: a safety decline is retried on Anthropic's recommended model in the same call.
        ...(features.fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system,
        tools,
        messages,
      });
      model = response.model;
      const cacheWrite = response.usage.cache_creation_input_tokens ?? 0;
      const cacheWrite1h = response.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      input.calls?.push({
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWrite5mTokens: Math.max(0, cacheWrite - cacheWrite1h),
        cacheWrite1hTokens: cacheWrite1h,
      });
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

      if (response.stop_reason === "refusal") throw new AiRefusalError(response.stop_details?.category ?? null);
      if (response.stop_reason === "max_tokens") throw new AiNoReplyError("max_tokens");

      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!calls.length) {
        // The model answered in plain text instead of send_reply: use the text, in the decided language.
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (!text) throw new AiNoReplyError("no_reply");
        return {
          reply: { reply: text, reply_language: input.decision.language, customer_languages: [], language_request: null, catalog_product_ids: [], needs_human: false, handoff_reason: null },
          model,
          usage,
          toolCalls,
          toolLog,
          productIds,
        };
      }

      // Keep the assistant turn exactly as returned (thinking blocks included).
      messages.push({ role: "assistant", content: response.content });
      const replyCall = calls.find((c) => c.name === "send_reply");
      const lookups = calls.filter((c) => c.name !== "send_reply");

      if (replyCall && !lookups.length) {
        const parsed = assistantReplySchema.safeParse(replyCall.input);
        if (parsed.success) return { reply: parsed.data as AssistantReply, model, usage, toolCalls, toolLog, productIds };
        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: replyCall.id, is_error: true, content: `Invalid send_reply input: ${z.prettifyError(parsed.error).slice(0, 1000)}. Call send_reply again with every field.` }],
        });
        continue;
      }

      // All results for this turn go back in one user message.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of lookups) {
        toolCalls++;
        toolLog.push(call.name);
        const outcome = await runTool(call.name, call.input, input.tools).catch(() => ({ error: "tool_failed" as const }));
        if ("error" in outcome) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: JSON.stringify({ error: outcome.error }) });
          continue;
        }
        collectProductIds(call.name, call.input, outcome.result, productIds);
        results.push({ type: "tool_result", tool_use_id: call.id, content: toolResultContent(call.name, outcome.result) });
      }
      if (replyCall) {
        results.push({ type: "tool_result", tool_use_id: replyCall.id, is_error: true, content: "Not sent: read the results of your other tool calls first, then call send_reply on its own." });
      }
      messages.push({ role: "user", content: results });
    }
    throw new AiNoReplyError("max_steps");
  }
}

/** The customer's photos go into their latest turn, before its text (images first works best). */
export function withImages(turns: Anthropic.Beta.BetaMessageParam[], images: InputImage[]): Anthropic.Beta.BetaMessageParam[] {
  if (!images.length) return turns;
  const blocks: Anthropic.Beta.BetaImageBlockParam[] = images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }));
  const last = turns.at(-1);
  if (!last || last.role !== "user") return [...turns, { role: "user", content: [...blocks, { type: "text", text: "[photo]" }] }];
  const text = typeof last.content === "string" ? last.content : "";
  return [...turns.slice(0, -1), { role: "user", content: [...blocks, { type: "text", text: text || "[photo]" }] }];
}

/** For models without mid-conversation system messages: the turn context closes the customer's latest turn. */
export function withTurnContext(turns: Anthropic.Beta.BetaMessageParam[], context: string): Anthropic.Beta.BetaMessageParam[] {
  const block: Anthropic.Beta.BetaTextBlockParam = { type: "text", text: context };
  const last = turns.at(-1);
  if (!last || last.role !== "user") return [...turns, { role: "user", content: [block] }];
  const content = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;
  return [...turns.slice(0, -1), { role: "user", content: [...content, block] }];
}

/** Tool results go back as JSON text — except catalog photos, which the model sees as images. */
function toolResultContent(name: string, result: unknown): Anthropic.Beta.BetaToolResultBlockParam["content"] {
  if (name === "viewProductPhotos" && result && typeof result === "object" && "photos" in result) {
    const { photos, withoutPhoto } = result as { photos: ProductPhoto[]; withoutPhoto: string[] };
    const content: Exclude<Anthropic.Beta.BetaToolResultBlockParam["content"], string | undefined> = [
      { type: "text", text: JSON.stringify({ photos: photos.map((p) => ({ productId: p.productId, name: p.name })), withoutPhoto }) },
    ];
    for (const p of photos) {
      content.push({ type: "text", text: `Photo of ${p.name} (${p.productId}):` });
      content.push({ type: "image", source: { type: "base64", media_type: p.image.mediaType, data: p.image.data } });
    }
    return content;
  }
  return JSON.stringify(result ?? null).slice(0, MAX_TOOL_RESULT_CHARS);
}

/** Remembers which products the tools actually returned, so the reply can only quote those. */
function collectProductIds(name: string, input: unknown, result: unknown, ids: Set<string>) {
  if (name === "viewProductPhotos" && result && typeof result === "object" && "photos" in result) {
    for (const p of (result as { photos: ProductPhoto[] }).photos) ids.add(p.productId);
  }
  if (name === "searchProducts" && Array.isArray(result)) {
    for (const p of result) if (p && typeof p === "object" && "productId" in p) ids.add(String((p as { productId: string }).productId));
  }
  if (name === "checkProductStock" && result && typeof result === "object" && (result as { found?: boolean }).found) {
    const productId = (input as { productId?: string } | null)?.productId;
    if (productId) ids.add(productId);
  }
}
