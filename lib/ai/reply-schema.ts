import { z } from "zod";

import { LANGUAGE_CODES } from "@/lib/i18n/languages";

/**
 * The structured reply the model must return for every customer message
 * (passed as the structured-output format when the Claude call is wired up
 * in the WhatsApp phase). Language fields let the server check the model
 * replied in the language it was told to, and record what the customer used.
 */
export const assistantReplySchema = z.object({
  reply: z.string().describe("The WhatsApp message to send to the customer."),
  reply_language: z.enum(LANGUAGE_CODES).describe("Language code of `reply`."),
  customer_languages: z
    .array(z.enum(LANGUAGE_CODES))
    .describe("Languages used in the customer's latest message, most used first."),
  language_request: z
    .enum(LANGUAGE_CODES)
    .nullable()
    .describe("Language the customer explicitly asked you to use in their latest message, or null."),
  needs_human: z.boolean().describe("True when a person from the business must take over."),
  handoff_reason: z.string().nullable().describe("Short internal reason for the handoff, or null."),
});

export type AssistantReply = z.infer<typeof assistantReplySchema>;

/** Server-side check that the model followed the language decision. */
export function replyLanguageMismatch(expected: string, reply: Pick<AssistantReply, "reply_language" | "language_request">) {
  if (reply.reply_language === expected) return null;
  // The customer asked for another language in this very message: the model may honour it.
  if (reply.language_request && reply.language_request === reply.reply_language) return null;
  return { expected, actual: reply.reply_language };
}
