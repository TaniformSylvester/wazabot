import type { LanguageCode } from "@/lib/i18n/languages";

import { languagePacks, type AiLanguagePack } from "./packs";

/**
 * Fast, offline language pre-detection for WhatsApp messages.
 *
 * Customers in Cameroon often mix English, French and Pidgin in one message,
 * write without accents and use SMS spelling, so this scores every supported
 * language instead of picking one. It is deliberately simple and
 * explainable: it runs on every inbound message before the model is called,
 * decides which language to reply in (see resolve.ts), and is handed to the
 * model as a hint. The model still reads the whole message and conversation.
 */

export type DetectionResult = {
  /** Most likely language, or null when the message has no usable signal ("ok", "👍", a number). */
  primary: LanguageCode | null;
  /** 0–1. Below CONFIDENT_THRESHOLD the caller should not switch languages on this message alone. */
  confidence: number;
  /** A second language used substantially in the same message (code-switching), if any. */
  secondary: LanguageCode | null;
  mixed: boolean;
  /** Raw evidence per language, for logging and debugging. */
  scores: Record<LanguageCode, number>;
};

export const CONFIDENT_THRESHOLD = 0.6;

const STRONG = 3;
const PHRASE = 3;
const COMMON = 1;
const MAX_CHARACTER_BONUS = 3;
/** A second language counts as mixed in when it has at least this share of the primary's evidence. */
const MIX_RATIO = 0.25;
const MIX_MIN_SCORE = 3;
/** French elisions: "c'est", "j'ai", "l'adresse", "qu'il" ... */
const ELISION = /^(c|j|l|d|n|s|m|t|qu)'(.+)$/;

export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function tokenize(normalized: string): string[] {
  return normalized.match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
}

type CompiledPack = {
  pack: AiLanguagePack;
  strong: Set<string>;
  common: Set<string>;
  phrases: RegExp[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compiled: CompiledPack[] = Object.values(languagePacks).map((pack) => ({
  pack,
  strong: new Set(pack.detection.strong),
  common: new Set(pack.detection.common),
  phrases: pack.detection.phrases.map((p) => new RegExp(`(?:^|[^a-z'])${escape(p)}(?=$|[^a-z'])`, "g")),
}));

function rawScores(text: string): Record<LanguageCode, number> {
  const normalized = normalize(text);
  const tokens = tokenize(normalized);
  // Split elided French forms so "c'est" also counts as "est".
  const expanded: string[] = [];
  let elisions = 0;
  for (const token of tokens) {
    expanded.push(token);
    const m = ELISION.exec(token);
    if (m) {
      elisions += 1;
      expanded.push(m[2]);
    }
  }

  const scores = {} as Record<LanguageCode, number>;
  for (const { pack, strong, common, phrases } of compiled) {
    let score = 0;
    for (const token of expanded) {
      if (strong.has(token)) score += STRONG;
      else if (common.has(token)) score += COMMON;
    }
    const spaced = ` ${tokens.join(" ")} `;
    for (const phrase of phrases) {
      phrase.lastIndex = 0;
      score += (spaced.match(phrase)?.length ?? 0) * PHRASE;
    }
    if (pack.detection.characters) {
      const chars = text.toLowerCase().match(pack.detection.characters)?.length ?? 0;
      score += Math.min(chars, MAX_CHARACTER_BONUS);
    }
    if (pack.code === "fr") score += Math.min(elisions, 2);
    scores[pack.code] = score;
  }
  return scores;
}

export function detectLanguage(text: string): DetectionResult {
  const scores = rawScores(text);
  const effective = { ...scores };

  // A creole with clear evidence absorbs the words it shares with its lexifier:
  // "Abeg how much for dis bag" is Pidgin, not English mixed with Pidgin.
  const absorbed = new Set<LanguageCode>();
  for (const { pack } of compiled) {
    const lexifier = pack.detection.lexifier;
    if (!lexifier || scores[pack.code] < STRONG) continue;
    effective[pack.code] += scores[lexifier] * 0.5;
    effective[lexifier] = scores[lexifier] * 0.5;
    absorbed.add(lexifier);
  }

  const ranked = (Object.entries(effective) as [LanguageCode, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return { primary: null, confidence: 0, secondary: null, mixed: false, scores };
  }

  const [primary, best] = ranked[0];
  const total = ranked.reduce((sum, [, s]) => sum + s, 0);
  // Share of the evidence × amount of evidence: one greeting ("Bonjour") is enough, one "how" is not.
  const confidence = round((best / total) * Math.min(1, (best + 2) / 6));

  const candidates = ranked.slice(1).filter(([code]) => !absorbed.has(code) || languagePacks[primary].detection.lexifier !== code);
  const second = candidates[0];
  const mixed = !!second && second[1] >= MIX_MIN_SCORE && second[1] >= best * MIX_RATIO;

  return { primary, confidence, secondary: mixed ? second[0] : null, mixed, scores };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
