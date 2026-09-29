import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./config";

/**
 * Picks the best UI locale from an Accept-Language header
 * ("fr-CM,fr;q=0.9,en;q=0.8" → "fr"). Only the primary subtag matters.
 */
export function matchLocale(acceptLanguage: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!acceptLanguage) return fallback;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((l) => l.base && l.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { base } of ranked) {
    if (isLocale(base)) return base;
  }
  return LOCALES.includes(fallback) ? fallback : DEFAULT_LOCALE;
}
