import "server-only";

import type { BusinessContext, ConversationContext } from "@/lib/ai/context";
import { detectLanguage as detect, type DetectionResult, type LanguageDecision } from "@/lib/ai/language";
import { assistantReplySchema, replyLanguageMismatch, type AssistantReply } from "@/lib/ai/reply-schema";
import type { InputImage } from "@/lib/ai/images";
import type { ToolContext } from "@/lib/ai/tools/registry";
import type { ClaudeCallUsage } from "@/lib/billing/costs";

export { buildBusinessContext, buildConversationContext } from "@/lib/ai/context";
export type { BusinessContext, ConversationContext } from "@/lib/ai/context";

/*
 * The AI service boundary. The webhook pipeline (lib/ai/pipeline.ts) depends
 * only on these types; lib/ai/claude.ts implements AiResponder with Claude.
 * Server-only: the API key never reaches the browser.
 */

export type GenerateInput = {
  business: BusinessContext;
  conversation: ConversationContext;
  /** Reply language chosen by lib/ai/language for the latest customer message. */
  decision: LanguageDecision;
  detection: DetectionResult;
  /** Business-scoped context the tools run with. */
  tools: ToolContext;
  /** Photos sent with the latest customer message (already normalised by lib/ai/images). */
  images?: InputImage[];
  now: Date;
  /** Prompt-cache lifetime for the cached prefix (1h for businesses that are busy right now). */
  cacheTtl?: "5m" | "1h";
  /** Filled with every Messages API request made, even when generate() then fails (cost logging). */
  calls?: ClaudeCallUsage[];
};

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export type GenerateResult = {
  reply: AssistantReply;
  model: string;
  usage: AiUsage;
  toolCalls: number;
  /** Names of the tools called, in order (shown in the test chat). */
  toolLog: string[];
  /** Product ids returned by catalog tools this turn — the only ones the reply may quote. */
  productIds: Set<string>;
};

export interface AiResponder {
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** Generates a reply — only when the business and the conversation allow it (null = stay silent). */
export async function generateResponse(input: GenerateInput, responder: AiResponder): Promise<GenerateResult | null> {
  if (!input.business.settings.aiEnabled || !input.conversation.aiEnabled) return null;
  return responder.generate(input);
}

export function detectLanguage(text: string): DetectionResult {
  return detect(text);
}

export type ValidationIssue = "schema" | "language_mismatch" | "unknown_product" | "too_long" | "empty";

/** WhatsApp's limit for a text message body. */
export const WHATSAPP_TEXT_LIMIT = 4096;

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
