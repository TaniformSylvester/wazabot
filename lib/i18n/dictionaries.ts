import { lang } from "next/root-params";
import { notFound } from "next/navigation";

import type { Messages } from "@/messages/en";

import { isLocale, type Locale } from "./config";
import { getDictionary } from "./load";

export type { Messages };
export { getDictionary };

/** The current UI locale, from the /[lang] root segment. Server Components only. */
export async function getLocale(): Promise<Locale> {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  return locale;
}

/** The dictionary for the current request. Server Components only. */
export async function getMessages(): Promise<Messages> {
  return getDictionary(await getLocale());
}
