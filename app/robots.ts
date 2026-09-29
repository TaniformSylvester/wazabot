import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { LOCALES } from "@/lib/i18n/config";

export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/login", "/register", "/forgot-password", "/reset-password", "/dashboard"];
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...privatePaths, ...LOCALES.flatMap((l) => privatePaths.map((p) => `/${l}${p}`))],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
