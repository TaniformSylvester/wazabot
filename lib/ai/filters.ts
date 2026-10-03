import { REPEAT_WINDOW_MINUTES, SPAM_MAX_CHARS, SPAM_MAX_LINKS } from "@/config/economics";

/*
 * Cheap checks before any model call: messages Claude shouldn't be paid to
 * read. Pure functions; the pipeline decides what happens next.
 */

/** Only emoji, symbols, punctuation and spaces ("👍", "🙏🏾🙏🏾", "❤️ !"). */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return !/[\p{L}\p{N}]/u.test(t);
}

const normalise = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

export type SpamReason = "repeat" | "too_long" | "links";

/**
 * - repeat: the same text as one of the customer's messages in the last few
 *   minutes (already answered, or about to be)
 * - too_long / links: pastes and link floods; a person should look at them
 */
export function spamReason(text: string, earlierCustomerMessages: { text: string; at: string }[], now: Date): SpamReason | null {
  if (text.length > SPAM_MAX_CHARS) return "too_long";
  if ((text.match(/https?:\/\/|www\./gi) ?? []).length >= SPAM_MAX_LINKS) return "links";
  const since = now.getTime() - REPEAT_WINDOW_MINUTES * 60_000;
  const t = normalise(text);
  if (t && earlierCustomerMessages.some((m) => normalise(m.text) === t && new Date(m.at).getTime() >= since)) return "repeat";
  return null;
}
