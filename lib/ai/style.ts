import type { LanguageCode } from "@/lib/i18n/languages";

/**
 * How a business wants its WhatsApp assistant to sound. Stored per business in
 * the `ai_settings` table; the option lists below match its check constraints.
 */
/** "Personality" in the dashboard. */
export const TONES = ["professional", "friendly", "casual"] as const;
export const FORMALITY_LEVELS = ["informal", "neutral", "formal"] as const;
export const EMOJI_LEVELS = ["none", "light", "expressive"] as const;
export const REPLY_LENGTHS = ["short", "medium", "detailed"] as const;
/**
 * auto  — reply in the customer's language (detected, or what they asked for).
 * fixed — always reply in the business's default language.
 */
export const LANGUAGE_MODES = ["auto", "fixed"] as const;
export const STYLE_NOTES_MAX = 500;

export type Tone = (typeof TONES)[number];
export type Formality = (typeof FORMALITY_LEVELS)[number];
export type EmojiLevel = (typeof EMOJI_LEVELS)[number];
export type ReplyLength = (typeof REPLY_LENGTHS)[number];
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export type ResponseStyle = {
  tone: Tone;
  formality: Formality;
  emojiLevel: EmojiLevel;
  replyLength: ReplyLength;
  /** Allow replies to mirror a customer's language mixing (e.g. French with English words). */
  mirrorCodeSwitching: boolean;
  /** Free-text notes from the business owner, e.g. "Call customers 'Ma' or 'Sir'". */
  styleNotes: string;
};

export type LanguageSettings = {
  mode: LanguageMode;
  defaultLanguage: LanguageCode;
  /** Languages the assistant may reply in. Always includes defaultLanguage. */
  enabledLanguages: LanguageCode[];
};

export const defaultResponseStyle: ResponseStyle = {
  tone: "friendly",
  formality: "neutral",
  emojiLevel: "light",
  replyLength: "short",
  mirrorCodeSwitching: false,
  styleNotes: "",
};

/** Language-independent style guidance for the system prompt. */
export const styleGuidance = {
  tone: {
    friendly: "Friendly and approachable, like a helpful shop assistant.",
    professional: "Professional and efficient: courteous, precise, no chit-chat.",
    casual: "Relaxed and casual, like chatting with a regular customer — still polite and clear.",
  },
  emojiLevel: {
    none: "Do not use emoji.",
    light: "At most one emoji per message, only where it feels natural.",
    expressive: "Emoji are welcome (a few per message) but never replace words.",
  },
  replyLength: {
    short: "Keep replies short: 1–3 sentences, like a quick WhatsApp message.",
    medium: "Replies of up to about 5 sentences; use short lists for several items.",
    detailed: "Give complete answers with the relevant details; use short lists where helpful.",
  },
} satisfies {
  tone: Record<Tone, string>;
  emojiLevel: Record<EmojiLevel, string>;
  replyLength: Record<ReplyLength, string>;
};
