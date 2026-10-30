import { siteConfig } from "@/config/site";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { loadShop } from "@/lib/shop/data";
import { renderShop, renderShopNotFound } from "@/lib/shop/render";

/**
 * The public shop page: one small HTML document (no framework JavaScript),
 * cached by the CDN for a few minutes so most visitors never wait for the
 * database. Products and prices come from the business's catalogue.
 */
export async function GET(request: Request, ctx: RouteContext<"/s/[slug]">) {
  const { slug } = await ctx.params;
  const url = new URL(request.url);
  const asked = url.searchParams.get("lang");
  const q = url.searchParams.get("q")?.slice(0, 60) || undefined;
  const category = url.searchParams.get("cat")?.slice(0, 80) || undefined;
  const page = Number(url.searchParams.get("page")) || 1;
  const shop = await loadShop(slug.toLowerCase(), { q, category, page });
  const locale = isLocale(asked) ? asked : (shop?.defaultLocale ?? "en");
  const t = (await getDictionary(locale)).shop;
  if (!shop) {
    return new Response(renderShopNotFound(t, locale), {
      status: 404,
      // Not kept by the browser (the owner may turn the shop on any moment); briefly by the CDN.
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=30" },
    });
  }
  const canonical = `${siteConfig.url.replace(/\/$/, "")}/s/${shop.slug}${isLocale(asked) && asked !== shop.defaultLocale ? `?lang=${asked}` : ""}`;
  return new Response(renderShop(shop, { locale, t, url: canonical, q, category }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // A few minutes at the CDN; an older copy may be served while it refreshes.
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
