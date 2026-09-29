import { z } from "zod";

import { EMOJI_LEVELS, FORMALITY_LEVELS, LANGUAGE_MODES, REPLY_LENGTHS, STYLE_NOTES_MAX, TONES } from "@/lib/ai/style";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";

/** Languages & AI style form. Messages are keys into `auth.validation`. */
export const languageSettingsSchema = z
  .object({
    mode: z.enum(LANGUAGE_MODES),
    defaultLanguage: z.enum(LANGUAGE_CODES),
    enabledLanguages: z.array(z.enum(LANGUAGE_CODES)).min(1, "languages_required"),
    tone: z.enum(TONES),
    formality: z.enum(FORMALITY_LEVELS),
    emojiLevel: z.enum(EMOJI_LEVELS),
    replyLength: z.enum(REPLY_LENGTHS),
    mirrorCodeSwitching: z.boolean(),
    styleNotes: z.string().trim().max(STYLE_NOTES_MAX, "style_notes_too_long"),
  })
  .refine((v) => v.enabledLanguages.includes(v.defaultLanguage), {
    message: "default_language_enabled",
    path: ["defaultLanguage"],
  });

export type LanguageSettingsInput = z.infer<typeof languageSettingsSchema>;

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid" | "unknown"; fieldErrors?: Record<string, string[] | undefined> };
