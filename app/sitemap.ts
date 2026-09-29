import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { LOCALES } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";

const routes = ["/", "/how-it-works", "/features", "/solutions", "/pricing", "/resources", "/faq", "/about", "/contact", "/privacy", "/terms"];

/** Every page in every UI locale, with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  return routes.flatMap((route) =>
    LOCALES.map((locale) => ({
      url: `${siteConfig.url}${localizePath(locale, route)}`,
      changeFrequency: "monthly" as const,
      priority: route === "/" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${siteConfig.url}${localizePath(l, route)}`])),
      },
    })),
  );
}
