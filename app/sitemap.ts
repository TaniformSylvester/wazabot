import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

const routes = ["", "/how-it-works", "/features", "/solutions", "/pricing", "/resources", "/faq", "/about", "/contact", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
