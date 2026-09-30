import "server-only";

import type { BusinessContext, ConversationContext } from "@/lib/ai/context";
import { detectLanguage as detect, type DetectionResult } from "@/lib/ai/language";
import { assistantReplySchema, replyLanguageMismatch, type AssistantReply } from "@/lib/ai/reply-schema";
import { NotConfiguredError } from "@/lib/messaging/ports";

export { buildBusinessContext, buildConversationContext } from "@/lib/ai/context";
export type { BusinessContext, ConversationContext } from "@/lib/ai/context";

/*
 * The AI service boundary. Stage 3 plugs a Claude implementation into
 * `AiResponder`; the rest of the app (webhook, dashboard) depends only on
 * these functions. Server-only: the API key never reaches the browser.
 */

export type GenerateInput = {
  business: BusinessContext;
  conversation: ConversationContext;
  /** The customer's latest message, as text the model can read. */
  latestMessage: string;
};

export type GenerateResult = { reply: AssistantReply; model: string };

export interface AiResponder {
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** Placeholder until Stage 3: refuses clearly instead of pretending to answer. */
export const notConfiguredResponder: AiResponder = {
  async generate() {
    throw new NotConfiguredError("ai_responder");
  },
};

/**
 * Generates a reply — only when the business and the conversation allow it.
 * Returns null when the AI must stay silent (AI switched off, Human Mode).
 */
export async function generateResponse(input: GenerateInput, responder: AiResponder = notConfiguredResponder): Promise<GenerateResult | null> {
  if (!input.business.settings.aiEnabled || !input.conversation.aiEnabled) return null;
  return responder.generate(input);
}

export function detectLanguage(text: string): DetectionResult {
  return detect(text);
}

export type ValidationIssue = "schema" | "language_mismatch" | "unknown_product" | "too_long" | "empty";

/**
 * Checks a model reply before anything is sent: valid structure, the
 * expected language, only products the tools actually returned, a sane length.
 */
export function validateAIResponse(
  raw: unknown,
  expect: { language: string; allowedProductIds: ReadonlySet<string>; maxChars?: number },
): { ok: true; reply: AssistantReply } | { ok: false; issues: ValidationIssue[] } {
  const parsed = assistantReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: ["schema"] };
  const reply = parsed.data;
  const issues: ValidationIssue[] = [];
  if (!reply.reply.trim() && !reply.needs_human) issues.push("empty");
  if (replyLanguageMismatch(expect.language, reply)) issues.push("language_mismatch");
  if (reply.catalog_product_ids.some((id) => !expect.allowedProductIds.has(id))) issues.push("unknown_product");
  if (reply.reply.length > (expect.maxChars ?? 1500)) issues.push("too_long");
  return issues.length ? { ok: false, issues } : { ok: true, reply };
}
