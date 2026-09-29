import type { LanguageCode } from "@/lib/i18n/languages";

import { normalize } from "./detect";
import { languagePacks } from "./packs";

/**
 * Detects a customer explicitly asking for a language — "Please reply in
 * English", "En français svp", "You fit tok Pidgin?", "Parlez anglais" — in
 * English, French or Pidgin. An explicit request is the strongest language
 * signal: it is saved as the customer's preference (see resolve.ts).
 *
 * Negated requests ("I don't speak French", "je ne parle pas anglais") are
 * ignored. When several languages are named, the last request wins
 * ("I no sabi French, abeg tok English" → English).
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Verbs and cues that turn a language name into a request, in en / fr / wes. */
const REQUEST_CUES = [
  "speak", "talk", "reply", "answer", "respond", "write", "switch to", "change to", "continue",
  "parle", "parler", "parlez", "parles", "reponds", "repondez", "repondre", "ecris", "ecrivez", "ecrire",
  "continuez", "passe", "passez", "passer",
  "tok", "ansa", "sabi", "yan",
];
const PREPOSITIONS = ["in", "en", "for"];
const POLITE = ["please", "pls", "plz", "svp", "stp", "abeg", "s'il vous plait", "s'il te plait"];
const NEGATION = /\b(don't|dont|do not|can't|cant|cannot|no|not|never|ne|n'|pas|jamais|no fit|no sabi)\b[^.!?]{0,12}$/;

type Match = { language: LanguageCode; index: number };

const namesByLanguage = Object.values(languagePacks).map((pack) => ({
  code: pack.code,
  pattern: pack.names.map(escape).sort((a, b) => b.length - a.length).join("|"),
}));

const cue = REQUEST_CUES.map(escape).join("|");
const prep = PREPOSITIONS.join("|");
const polite = POLITE.map(escape).join("|");

const matchers = namesByLanguage.map(({ code, pattern }) => ({
  code,
  // "speak English", "reply me in French", "tok Pidgin", "parlez-vous anglais"
  withCue: new RegExp(`\\b(?:${cue})\\b[^.!?,;]{0,20}?\\b(?:${pattern})\\b`, "g"),
  // "In English please", "en français svp", "English please", "Pidgin abeg"
  polite: new RegExp(
    `(?:^|[.!?]\\s*)(?:(?:${prep})\\s+)?(?:${pattern})\\s*(?:${polite})?\\s*[.!?]*\\s*$|\\b(?:(?:${prep})\\s+)?(?:${pattern})\\s+(?:${polite})\\b`,
    "g",
  ),
}));

export function detectLanguageRequest(text: string): LanguageCode | null {
  const normalized = normalize(text).replace(/-/g, " ").trim();
  if (!normalized) return null;

  const matches: Match[] = [];
  for (const { code, withCue, polite: politeRe } of matchers) {
    for (const re of [withCue, politeRe]) {
      re.lastIndex = 0;
      for (const m of normalized.matchAll(re)) {
        const index = m.index ?? 0;
        const before = normalized.slice(Math.max(0, index - 24), index);
        const inside = m[0];
        if (NEGATION.test(before) || /\b(pas|not|no|don't|dont)\b/.test(inside)) continue;
        matches.push({ language: code, index: index + inside.length });
      }
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.index - b.index);
  return matches[matches.length - 1].language;
}
