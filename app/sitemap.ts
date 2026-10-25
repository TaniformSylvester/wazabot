import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { LANDING_SLUGS } from "@/config/solutions";
import { LOCALES } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";

const routes = [
  "/",
  "/how-it-works",
  "/features",
  "/solutions",
  ...LANDING_SLUGS.map((s) => `/solutions/${s}`),
  "/pricing",
  "/tools/documents",
  "/resources",
  "/faq",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];
/** Pages people search for, ranked above the rest. */
const PRIORITY: Record<string, number> = { "/": 1, "/pricing": 0.9, "/tools/documents": 0.9, "/features": 0.8, ...Object.fromEntries(LANDING_SLUGS.map((s) => [`/solutions/${s}`, 0.9])) };

/** Every page in every UI locale, with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  return routes.flatMap((route) =>
    LOCALES.map((locale) => ({
      url: `${siteConfig.url}${localizePath(locale, route)}`,
      changeFrequency: "monthly" as const,
      priority: PRIORITY[route] ?? (route === "/privacy" || route === "/terms" ? 0.3 : 0.7),
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${siteConfig.url}${localizePath(l, route)}`])),
      },
    })),
  );
}
