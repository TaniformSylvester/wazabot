import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

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

/**
 * Open Graph and Twitter tags for a page. Next merges metadata shallowly, so a
 * page that sets openGraph or twitter replaces the layout's: every page sends
 * the full set (site name, image, its own title and link).
 */
export function socialFor(locale: Locale, t: Messages, { title, description, path }: { title: string; description: string; path: string }): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      url: localizePath(locale, path),
      siteName: siteConfig.name,
      type: "website",
      locale: ogLocale[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => ogLocale[l]),
      images: [{ url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: t.meta.ogAlt }],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: `/${locale}/twitter-image`, alt: t.meta.ogAlt }] },
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
    ...socialFor(locale, t, { title: `${title} | ${siteConfig.name}`, description: description || t.meta.siteDescription, path }),
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}
