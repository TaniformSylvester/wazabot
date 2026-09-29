import type { Messages } from "@/messages/en";

import type { Locale } from "./config";

const dictionaries: Record<Locale, () => Promise<Messages>> = {
  en: () => import("@/messages/en").then((m) => m.default),
  fr: () => import("@/messages/fr").then((m) => m.default),
};

/** Load a UI dictionary. Safe anywhere on the server (Route Handlers, image routes, Server Actions). */
export function getDictionary(locale: Locale): Promise<Messages> {
  return dictionaries[locale]();
}
