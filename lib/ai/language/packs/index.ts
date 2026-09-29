import type { LanguageCode } from "@/lib/i18n/languages";

import { en } from "./en";
import { fr } from "./fr";
import type { AiLanguagePack } from "./types";
import { wes } from "./wes";

export type { AiLanguagePack } from "./types";

/** Every language the WhatsApp AI supports. Keyed by BCP-47 code. */
export const languagePacks: Record<LanguageCode, AiLanguagePack> = { en, fr, wes };

export function getLanguagePack(code: LanguageCode): AiLanguagePack {
  return languagePacks[code];
}

/** A fixed (non-model) message in the given language, with the business name filled in. */
export function fixedMessage(code: LanguageCode, key: keyof AiLanguagePack["messages"], businessName: string) {
  return languagePacks[code].messages[key].replaceAll("{business}", businessName);
}
