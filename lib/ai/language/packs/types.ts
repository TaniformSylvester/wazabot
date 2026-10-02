import type { Formality } from "@/lib/ai/style";
import type { LanguageCode } from "@/lib/i18n/languages";

/**
 * Everything the WhatsApp AI needs to know about one language. Adding a
 * language means writing one of these (see en.ts, fr.ts, wes.ts) and
 * registering it in ./index.ts — detection, explicit-request handling, the
 * system prompt and fixed messages all pick it up from here.
 */
export type AiLanguagePack = {
  code: LanguageCode;
  /**
   * Word lists for the fast, offline pre-detector (lib/ai/language/detect.ts).
   * All entries are lowercase and accent-free; the detector normalises input
   * the same way. The model makes the final call with full context — this
   * only gives it (and our routing) a reliable first signal.
   */
  detection: {
    /** Words that are strong evidence for this language (weight 3). */
    strong: string[];
    /** Frequent words that are weak evidence on their own (weight 1). */
    common: string[];
    /** Multi-word expressions (weight 3). */
    phrases: string[];
    /** Characters typical of the language, e.g. French accents (weight 1 each, max 3). */
    characters?: RegExp;
    /**
     * The language this one borrows most of its vocabulary from (Pidgin →
     * English). When this language has clear evidence, words shared with its
     * lexifier count towards it instead of signalling a language mix.
     */
    lexifier?: LanguageCode;
  };
  /** How people name this language, in any language (lowercase, accent-free). */
  names: string[];
  /** Guidance for writing replies in this language. */
  promptGuidance: string;
  /** Language-specific meaning of each formality level (e.g. French vous/tu). */
  formality: Record<Formality, string>;
  /** Messages sent without the model. `{business}` is replaced with the business name. */
  messages: {
    handoff: string;
    unavailable: string;
    languageSwitched: string;
    /** Voice note received while transcription is off. */
    audioNotSupported: string;
    /** Image received while image understanding is off (the team is notified). */
    imageNotSupported: string;
    /** Photos switched off by the business: passed to the team. */
    imagePassedOn: string;
    /** Document, video or location received (the team is notified). */
    attachmentReceived: string;
  };
  /** Translations marked "needs-review" must be checked by a fluent speaker before launch. */
  review: "source" | "needs-review";
};
