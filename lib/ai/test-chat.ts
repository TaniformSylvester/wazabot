import "server-only";

import { z } from "zod";

import { AiNoReplyError, AiRefusalError, ClaudeResponder, aiConfigured, describeAiError } from "@/lib/ai/claude";
import { buildBusinessContext, type ConversationContext } from "@/lib/ai/context";
import { prepareImage, type InputImage } from "@/lib/ai/images";
import { analyzeInboundMessage } from "@/lib/ai/language";
import { WHATSAPP_TEXT_LIMIT, validateAIResponse } from "@/lib/ai/service";
import { authorize } from "@/lib/auth/dal";
import { isOpenAt } from "@/lib/business/hours";
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * AI Assistant → Test chat. The same assistant as on WhatsApp (prompt,
 * knowledge, tools, language rules), but nothing is sent and nothing is
 * written: lookups are real, orders / customer details / handovers are
 * simulated. The transcript lives in the browser only.
 *
 * Called from the route handler app/api/ai/test-chat (a plain fetch, not a
 * Server Action, so a slow or failed answer can never take the page down).
 */

/** Test messages per business per hour — keeps a forgotten tab or a loop from running up the API bill. */
const TEST_LIMIT_PER_HOUR = 40;

const inputSchema = z.object({
  message: z.string().trim().max(1000),
  /** A photo "sent by the customer": base64 (the browser already shrinks it to ~1568 px JPEG). */
  image: z.string().max(6_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/).nullish(),
  history: z
    .array(z.object({ role: z.enum(["customer", "assistant"]), text: z.string().max(WHATSAPP_TEXT_LIMIT) }))
    .max(30),
  /** Language the test conversation is already in (from the previous reply). */
  language: z.string().nullable(),
});

export type TestChatResult =
  | {
      ok: true;
      reply: string;
      language: LanguageCode;
      needsHuman: boolean;
      handoffReason: string | null;
      tools: string[];
      /** The reply quoted a product the tools never returned — on WhatsApp it would be replaced by a handoff. */
      blocked: boolean;
      /** Outside opening hours with an after-hours setting other than "answer as usual". */
      afterHours: boolean;
    }
  | { ok: false; error: TestChatError };

export type TestChatError = "forbidden" | "not_configured" | "invalid" | "image_invalid" | "rate_limited" | "refusal" | "failed" | "network" | "timeout";

export async function sendTestMessage(input: unknown): Promise<TestChatResult> {
  try {
    return await runTestMessage(input);
  } catch (e) {
    logServerError("ai.testChat", { code: "unexpected", message: e instanceof Error ? e.name : "error" });
    return { ok: false, error: "failed" };
  }
}

async function runTestMessage(input: unknown): Promise<TestChatResult> {
  const ctx = await authorize("agent");
  if (!ctx) return { ok: false, error: "forbidden" };
  if (!aiConfigured()) return { ok: false, error: "not_configured" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { message, history, language, image } = parsed.data;
  if (!message && !image) return { ok: false, error: "invalid" };
  let images: InputImage[] = [];
  if (image) {
    try {
      images = [await prepareImage(Buffer.from(image, "base64"))];
    } catch {
      return { ok: false, error: "image_invalid" };
    }
  }
  const businessId = ctx.business.id;

  const admin = createAdminClient();
  if (admin) {
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("reason", "test_chat")
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= TEST_LIMIT_PER_HOUR) return { ok: false, error: "rate_limited" };
  }

  // Read with the user's own session: RLS limits everything to their business.
  const db = await createClient();
  const now = new Date();
  const business = await buildBusinessContext(db, businessId, now);
  if (!business) return { ok: false, error: "failed" };

  const conversationLanguage = language && isLanguageCode(language) ? language : null;
  const conversation: ConversationContext = {
    conversationId: "test",
    aiEnabled: true,
    language: conversationLanguage,
    customer: { id: "test", whatsappPhone: "000000000", name: "", city: null, preferredLanguage: null, preferredLanguageSource: null, tags: [] },
    history: [...history.map((h) => ({ role: h.role, text: h.text, at: now.toISOString() })), { role: "customer" as const, text: images.length ? `[photo] ${message}`.trim() : message, at: now.toISOString() }],
  };
  const analysis = analyzeInboundMessage(message, { settings: business.language, conversationLanguage });

  const started = Date.now();
  try {
    const result = await new ClaudeResponder().generate({
      business,
      conversation,
      decision: analysis.decision,
      detection: analysis.detection,
      now,
      tools: { db, businessId, conversationId: null, customerId: null, dryRun: true },
      images,
    });
    const check = validateAIResponse(result.reply, { language: analysis.decision.language, allowedProductIds: result.productIds, maxChars: WHATSAPP_TEXT_LIMIT });
    await admin?.from("ai_usage").insert({
      business_id: businessId,
      model: result.model.slice(0, 80),
      outcome: "replied",
      reason: "test_chat",
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cache_read_tokens: result.usage.cacheReadTokens,
      cache_write_tokens: result.usage.cacheWriteTokens,
      tool_calls: result.toolCalls,
      duration_ms: Date.now() - started,
    });
    const open = isOpenAt(business.business.openingHours, business.business.timezone, now);
    return {
      ok: true,
      reply: result.reply.reply,
      language: isLanguageCode(result.reply.reply_language) ? result.reply.reply_language : analysis.decision.language,
      needsHuman: result.reply.needs_human,
      handoffReason: result.reply.handoff_reason,
      tools: result.toolLog,
      blocked: !check.ok && check.issues.some((i) => i === "unknown_product" || i === "empty" || i === "too_long"),
      afterHours: open === false && business.settings.afterHoursMode !== "reply_normally",
    };
  } catch (e) {
    const reason = e instanceof AiRefusalError ? "refusal" : e instanceof AiNoReplyError ? e.reason : "api_error";
    logServerError("ai.testChat", describeAiError(e));
    await admin?.from("ai_usage").insert({ business_id: businessId, model: "none", outcome: "failed", reason: "test_chat", duration_ms: Date.now() - started });
    return { ok: false, error: reason === "refusal" ? "refusal" : "failed" };
  }
}
