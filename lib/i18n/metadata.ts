import type { Metadata } from "next";

import { LOCALES, ogLocale, type Locale } from "./config";
import { getLocale, getMessages, type Messages } from "./dictionaries";
import { localizePath } from "./paths";

/** Canonical + hreflang alternates for a path that exists in every locale. */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localizePath(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, localizePath(l, path)])),
      "x-default": path,
    },
  };
}

/** Localized title/description/alternates for a page. Use in generateMetadata(). */
export async function pageMetadata(
  page: keyof Messages["meta"]["pages"],
  path: string,
  { index = true }: { index?: boolean } = {},
): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { title, description } = t.meta.pages[page];
  return {
    title,
    ...(description ? { description } : {}),
    alternates: alternatesFor(locale, path),
    openGraph: { locale: ogLocale[locale], ...(description ? { description } : {}), title },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}
