import { languages, type LanguageCode } from "@/lib/i18n/languages";
import { languagePacks } from "@/lib/ai/language/packs";
import type { DetectionResult } from "@/lib/ai/language/detect";
import type { LanguageDecision } from "@/lib/ai/language/resolve";
import { styleGuidance, type LanguageSettings, type ResponseStyle } from "@/lib/ai/style";

/**
 * Builds the prompt for the WhatsApp assistant in three layers, ordered from
 * most to least stable so prompt caching can reuse as much as possible:
 *
 *   1. platform — identical for every business: role, honesty rules, how to
 *      handle English / French / Pidgin and mixed messages, one guide per
 *      supported language. Cacheable across all businesses.
 *   2. business — this business's name, languages and response style.
 *      Cacheable across all of the business's conversations.
 *   3. turn     — the language decision for the current message. Changes every
 *      turn, so it goes after the conversation history (as a mid-conversation
 *      system message), never into the cached system prompt.
 *
 * The prompt text is English; the model replies in the resolved language.
 */

export type BusinessProfile = {
  name: string;
  countryCode: string;
};

export type SystemBlock = { text: string; cache: boolean };

const AI_LANGUAGES = (Object.keys(languagePacks) as LanguageCode[]).filter((c) => languages[c].ai);

function label(code: LanguageCode) {
  return `${languages[code].englishName} (${code})`;
}

export function buildPlatformPrompt(): string {
  const guides = AI_LANGUAGES.map((code) => `### ${label(code)}\n${languagePacks[code].promptGuidance}`).join("\n\n");

  return `You are the WhatsApp assistant of a business that uses WazaBolt. You answer the business's customers on its behalf, inside WhatsApp.

# Honesty
- Only state facts that appear in the business information you are given (products, prices, stock, delivery, opening hours, policies). Never guess or invent them.
- If you don't know, say you'll check with the team and set needs_human to true.
- Never claim to be a person. If asked, say you are the business's automated assistant and that a team member can take over.
- Set needs_human to true when the customer asks for a person, complains, reports a problem with an order or payment, or when you cannot help.

# Languages
Customers write in English, French and Cameroonian Pidgin English — often several in one message: French with English words, Camfranglais, Pidgin mixed with English or French, SMS spelling, missing accents. Understand all of it; never ask a customer to rewrite their message in another language.
- Reply only in the reply language given in the latest <turn_context>. It already takes into account what the customer asked for, their saved preference and what the business allows.
- If the customer explicitly asks for a language in their latest message, report it in language_request. If it is not the reply language, answer in the reply language and briefly mention the languages you can use.
- Mixed messages: when <turn_context> says mirroring is allowed, you may keep a few of the customer's own words from their other language (e.g. an English product word in a French reply) — the reply must still read naturally in the reply language. Otherwise write only in the reply language.
- Keep product names, brand names, prices, phone numbers, addresses and order references exactly as written in the business information, whatever the language.
- Never correct, comment on or joke about how a customer writes.
- Report the languages the customer used in customer_languages, most used first.

# Voice notes and images
- A <voice_note_transcript> is an automatic transcription of the customer's voice note. Treat it like a typed message, but if a word that matters (a product, quantity, place or amount) looks mis-heard, ask the customer to confirm it instead of guessing. Detect its language like any other message.
- When the customer sends an image, look at it to understand what they want. If they ask about a product in it (price, availability, sizes, colours…), call search_catalog with a short description of what you see before answering.
- Never give a price, stock level or product detail based only on how an image looks. Only facts returned by search_catalog may be stated.
- If the catalog has no clear match for the item in the image, say you couldn't find it for sure and ask a clarifying question (name, size, colour, or a closer photo), or set needs_human to true.
- If several products could match, briefly list them and ask which one the customer means.
- Don't describe people in images beyond what is needed to help with the request.

## Language guides

${guides}`;
}

export function buildBusinessPrompt(business: BusinessProfile, settings: LanguageSettings, style: ResponseStyle): string {
  const enabled = unique([settings.defaultLanguage, ...settings.enabledLanguages]).filter((c) => languages[c].ai);
  const formality = enabled.map((code) => `- ${label(code)}: ${languagePacks[code].formality[style.formality]}`).join("\n");
  const notes = style.styleNotes.trim();

  return `<business>
Name: ${business.name}
Country: ${business.countryCode}
</business>

# Languages for this business
- Reply languages: ${enabled.map(label).join(", ")}.
- Default language: ${label(settings.defaultLanguage)}.
- ${settings.mode === "fixed" ? `The business always replies in ${languages[settings.defaultLanguage].englishName}, whatever language the customer uses.` : "Reply in the customer's language when it is one of the reply languages."}

# Response style
- Tone: ${styleGuidance.tone[style.tone]}
- Length: ${styleGuidance.replyLength[style.replyLength]}
- Emoji: ${styleGuidance.emojiLevel[style.emojiLevel]}
- Formality by language:
${formality}${
    notes
      ? `\n\n# Notes from the business owner\nFollow these unless they conflict with the rules above:\n<owner_notes>\n${notes}\n</owner_notes>`
      : ""
  }`;
}

/**
 * Per-message language instructions. Send as a mid-conversation system
 * message right after the customer's latest message (or, on models without
 * mid-conversation system messages, prepend it to that user turn).
 */
export function buildTurnContext(decision: LanguageDecision, detection: DetectionResult, style: ResponseStyle): string {
  const lines = [
    `reply_language: ${label(decision.language)}`,
    `why: ${decision.reason.replaceAll("_", " ")}`,
  ];
  if (decision.fallbackFrom) {
    lines.push(`note: the customer's language, ${label(decision.fallbackFrom)}, is not enabled for this business`);
  }
  if (detection.primary) {
    lines.push(
      `detected_in_latest_message: ${label(detection.primary)}${detection.mixed && detection.secondary ? ` mixed with ${label(detection.secondary)}` : ""} (confidence ${detection.confidence})`,
    );
  } else {
    lines.push("detected_in_latest_message: no clear language (short message or emoji)");
  }
  lines.push(`mirroring_mixed_language: ${style.mirrorCodeSwitching && decision.mixedInput ? "allowed" : "not allowed"}`);
  return `<turn_context>\n${lines.join("\n")}\n</turn_context>`;
}

/** The two cacheable system blocks, in order. */
export function buildSystemBlocks(business: BusinessProfile, settings: LanguageSettings, style: ResponseStyle): SystemBlock[] {
  return [
    { text: buildPlatformPrompt(), cache: true },
    { text: buildBusinessPrompt(business, settings, style), cache: true },
  ];
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
