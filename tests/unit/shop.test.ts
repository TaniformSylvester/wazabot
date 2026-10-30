import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { renderShop, renderShopNotFound } from "@/lib/shop/render";
import type { Shop, ShopProduct } from "@/lib/shop/types";
import en from "@/messages/en";
import fr from "@/messages/fr";

const product = (n: number, extra: Partial<ShopProduct> = {}): ShopProduct => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Robe Ankara ${n}`,
  description: null,
  category: n % 2 ? "Robes" : "Sacs",
  price: 15000,
  priceFrom: false,
  hasOptions: false,
  inStock: true,
  photo: n % 3 ? "1793000000" : null,
  ...extra,
});
const shop = (over: Partial<Shop> = {}): Shop => ({
  slug: "awa-styles",
  name: "Awa Styles",
  description: "La mode wax de Douala",
  city: "Douala",
  address: "Rue Joss, Akwa",
  currency: "XAF",
  defaultLocale: "fr",
  openingHours: { mon: { closed: false, open: "08:00", close: "18:00" }, sun: { closed: true, open: "09:00", close: "13:00" } },
  timezone: "Africa/Douala",
  openNow: true,
  logo: null,
  whatsapp: "237670000000",
  branches: [],
  categories: ["Robes", "Sacs"],
  products: [product(1), product(2, { inStock: false }), product(3, { price: 12000, priceFrom: true, hasOptions: true })],
  total: 3,
  page: 1,
  ...over,
});
const render = (s: Shop, locale: "en" | "fr" = "fr", extra = {}) => renderShop(s, { locale, t: (locale === "fr" ? fr : en).shop, url: "https://www.wazabolt.com/s/awa-styles", ...extra });

describe("shop page HTML", () => {
  it("is one small document: no framework scripts, no web fonts, under 20 KB for a full page of 48 products", () => {
    const products = Array.from({ length: 48 }, (_, i) => product(i + 1));
    const html = render(shop({ products, total: 120 }));
    expect(html).not.toMatch(/<script src|_next\/static|fonts\.googleapis|@font-face/);
    const kb = Buffer.byteLength(html) / 1024;
    expect(kb).toBeLessThan(40); // uncompressed; it travels gzipped (about a fifth of this)
    expect(gzipSync(html).length / 1024).toBeLessThan(20);
  });

  it("each product: name, price in FCFA, a lazy small photo, and an order link to the business's WhatsApp with the product and price", () => {
    const html = render(shop());
    expect(html).toContain("Robe Ankara 1");
    expect(html).toMatch(/15\s000 FCFA/);
    expect(html).toContain('src="/s/awa-styles/img/00000000-0000-4000-8000-000000000001?v=1793000000"');
    expect(html).toContain('loading="lazy"');
    const order = decodeURIComponent(html.match(/href="https:\/\/wa\.me\/237670000000\?text=([^"]+)"/)![1].replace(/&amp;/g, "&"));
    expect(order).toMatch(/^Bonjour Awa Styles, je voudrais commander : Robe Ankara 1 \(15\s000 FCFA\)\.$/);
  });

  it("out of stock: said, and no order button; options and 'from' prices", () => {
    const html = render(shop(), "en");
    const card2 = html.slice(html.indexOf("Robe Ankara 2"), html.indexOf("Robe Ankara 3"));
    expect(card2).toContain("Out of stock");
    expect(card2).not.toContain("Order on WhatsApp");
    expect(html).toMatch(/from 12,000 FCFA/);
    expect(html).toContain("Several options");
  });

  it("never shows stock quantities, and escapes everything the business typed", () => {
    const html = render(shop({ name: 'Awa <script>alert("x")</script>', products: [product(1, { name: "Sac <b>raphia</b> & co" })] }));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Awa &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Sac &lt;b&gt;raphia&lt;/b&gt; &amp; co");
  });

  it("search works without JavaScript (a GET form), categories are links, pages link to each other", () => {
    const html = render(shop({ total: 120, page: 2 }), "fr", { q: "robe" });
    expect(html).toMatch(/<form method="get" action="\/s\/awa-styles" role="search">/);
    expect(html).toContain('href="/s/awa-styles?cat=Robes"');
    expect(html).toContain('href="/s/awa-styles?q=robe&amp;page=1"');
    expect(html).toContain('href="/s/awa-styles?q=robe&amp;page=3"');
    expect(html).toContain("Page 2 sur 3");
  });

  it("the other language keeps ?lang; no WhatsApp number: no order buttons, and it says so", () => {
    const html = render(shop({ whatsapp: null }), "en");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('href="/s/awa-styles?lang=en&amp;cat=Robes"');
    expect(html).not.toContain("wa.me");
    expect(html).toContain("hasn&#39;t added a WhatsApp number");
  });

  it("several branches are listed with their address and hours", () => {
    const html = render(shop({ branches: [{ name: "Akwa", address: "Rue Joss", city: "Douala", phone: null, hours: null }, { name: "Bonamoussadi", address: "Carrefour Kotto", city: null, phone: "677000000", hours: "Lun–Sam 8h–20h" }] }));
    expect(html).toContain("Nos succursales");
    expect(html).toContain("<b>Bonamoussadi</b> · Carrefour Kotto · 677000000 · Lun–Sam 8h–20h");
  });

  it("a missing or switched-off shop gets a small not-found page", () => {
    const html = renderShopNotFound(en.shop, "en");
    expect(html).toContain("Shop not found");
    expect(html).toContain('name="robots" content="noindex"');
  });
});
