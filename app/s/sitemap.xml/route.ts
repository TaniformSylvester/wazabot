import { siteConfig } from "@/config/site";
import { listOpenShops } from "@/lib/shop/data";

/**
 * The shops that are on, so search engines find them (robots.txt points
 * here). Shops that are off are never listed. Refreshed hourly at the CDN.
 */
// Read on each request (the CDN keeps it an hour), never frozen at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const base = siteConfig.url.replace(/\/$/, "");
  const shops = await listOpenShops();
  const urls = shops
    .map((s) => `<url><loc>${base}/s/${s.slug}</loc>${s.updatedAt ? `<lastmod>${new Date(s.updatedAt).toISOString()}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.6</priority></url>`)
    .join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
