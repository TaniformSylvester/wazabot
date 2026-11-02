import { siteConfig } from "@/config/site";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { loadShopCard } from "@/lib/shop/data";
import { renderPoster } from "@/lib/shop/poster";
import { renderShopNotFound } from "@/lib/shop/render";

/** The printable QR code poster of a shop that's on (A4, in the business's language or ?lang=). */
export async function GET(request: Request, ctx: RouteContext<"/s/[slug]/poster">) {
  const { slug } = await ctx.params;
  const asked = new URL(request.url).searchParams.get("lang");
  const card = await loadShopCard(slug.toLowerCase());
  const locale = isLocale(asked) ? asked : (card?.defaultLocale ?? "en");
  const t = (await getDictionary(locale)).shop;
  if (!card) {
    return new Response(renderShopNotFound(t, locale), { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=30" } });
  }
  const url = `${siteConfig.url.replace(/\/$/, "")}/s/${card.slug}`;
  return new Response(renderPoster(card, { locale, t, url }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" },
  });
}
