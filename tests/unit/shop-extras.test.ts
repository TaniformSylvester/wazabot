import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { ShopCard } from "@/lib/shop/data";
import { renderPoster } from "@/lib/shop/poster";
import { qrSvg } from "@/lib/shop/qr";
import en from "@/messages/en";
import fr from "@/messages/fr";

/** Reads a QR code SVG back the way a phone camera would (rasterised, then decoded). */
async function scan(svg: string, px = 400): Promise<string | null> {
  const { data, info } = await sharp(Buffer.from(svg)).resize(px, px).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

const card = (over: Partial<ShopCard> = {}): ShopCard => ({ slug: "awa-styles", name: "Awa Styles", city: "Douala", defaultLocale: "fr", logo: null, ...over });

describe("shop QR code", () => {
  it("scans back to the shop link, short and long", async () => {
    for (const url of ["https://www.wazabolt.com/s/awa-styles", `https://www.wazabolt.com/s/${"boutique-de-mode-".repeat(6)}douala`]) {
      expect(await scan(qrSvg(url))).toBe(url);
    }
  });

  it("still scans when printed small (≈ 2 cm on a cheap printer)", async () => {
    expect(await scan(qrSvg("https://www.wazabolt.com/s/awa-styles"), 120)).toBe("https://www.wazabolt.com/s/awa-styles");
  });

  it("is a small SVG with a quiet zone", () => {
    const svg = qrSvg("https://www.wazabolt.com/s/awa-styles");
    expect(svg.length).toBeLessThan(8000);
    expect(svg).toMatch(/viewBox="0 0 (\d+) \1"/);
    expect(svg).toMatch(/<rect width="\d+" height="\d+" fill="#FFFFFF"\/>/);
  });
});

describe("shop QR poster", () => {
  const url = "https://www.wazabolt.com/s/awa-styles";

  it("shows the name, city, headline, QR code and link, in the business's language; not indexed", async () => {
    const html = renderPoster(card(), { locale: "fr", t: fr.shop, url });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("<h1>Awa Styles</h1>");
    expect(html).toContain("Douala");
    expect(html).toContain(fr.shop.posterHeadline);
    expect(html).toContain("wazabolt.com/s/awa-styles");
    expect(html).toContain('<meta name="robots" content="noindex">');
    const svg = html.match(/<svg[\s\S]*?<\/svg>/)![0];
    expect(await scan(svg)).toBe(url);
  });

  it("prints on one A4 page, without the Print button", () => {
    const html = renderPoster(card(), { locale: "en", t: en.shop, url });
    expect(html).toContain("@page{size:A4");
    expect(html).toMatch(/@media print\{.*\.np\{display:none\}/);
    expect(html).toContain('onclick="print()"');
    // Nothing to download but the page: no scripts, fonts or images besides the logo.
    expect(html).not.toMatch(/<script|fonts\.g|<img/);
  });

  it("uses the logo thumbnail when there is one, and escapes the business's text", () => {
    const html = renderPoster(card({ name: '<b>"Awa"</b> & Co', city: "<i>Douala</i>", logo: "1793000000" }), { locale: "en", t: en.shop, url });
    expect(html).toContain('src="/s/awa-styles/img/logo?v=1793000000"');
    expect(html).toContain("&lt;b&gt;&quot;Awa&quot;&lt;/b&gt; &amp; Co");
    expect(html).not.toContain("<i>Douala</i>");
  });
});
