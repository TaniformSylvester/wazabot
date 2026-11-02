# Shop page: a public page per business (30 October 2026)

**What it is.** Every business can have a public page at **www.wazabolt.com/s/&lt;name&gt;**, for example `/s/awa-styles`. It shows:

- the business name, logo, city, description, opening hours and whether it's open now;
- its branches, if it has several;
- its active products, each with:
  - its price, or a "from" price when options cost more;
  - a photo;
  - whether it's in stock;
  - an **Order on WhatsApp** button.

The button opens a WhatsApp chat with the business, with the product and price already written, for example "Hello Awa Styles, I'd like to order: Robe Ankara (15,000 FCFA)." A **Chat on WhatsApp** bar stays at the bottom of the screen.

It's free on **every plan**. It's **off until the owner or an admin turns it on** in **Settings → Shop page**, because it publishes the catalogue. That panel shows the link, a copy button, **Open my shop** and **Share on WhatsApp**.

The page never shows stock quantities, costs, customers or anything about the team.

**The WhatsApp number** is the connected WhatsApp Business number, or otherwise the business phone number. Without either, the page says the business hasn't added a number yet and has no order buttons.

**Language:** the page uses the business's default language (English or French). `?lang=en` or `?lang=fr` switches it, and there's a link at the top.

## Built for weak connections

I measured the site first, with a production build on a simulated cheap phone (four times slower processor) and no files saved from an earlier visit.

| Page | Download | Slow 3G: first text | Slow 3G: loaded | Fast 3G: loaded |
|---|---|---|---|---|
| Home | 359 KB (181 KB JavaScript, 87 KB fonts) | 6.5 s | 11.3 s | 3.2 s |
| Dashboard pages | ~305 KB | ~5.8 s | ~11.5 s | ~3.5 s |
| **Shop page** (30 products with photos) | **20 KB**, no JavaScript files, no fonts | **2.1 s** | **2.4 s** | **0.8 s** |

The shop page is built differently from the rest of the site:

- **Plain HTML** made on the server, without the framework's JavaScript.
- **The phone's own fonts**, and the styles inside the page.
- **About ten lines of script**, only for searching as you type. Search also works without JavaScript (a normal form), and categories and pages are plain links.
- **Small photos.** Each product photo is shrunk once to a 300 × 300 WebP: a 1.9 MB phone photo becomes about 12–18 KB. It's then cached for a year. Photos below the screen load only when the visitor scrolls.
- **Cached by Vercel's network.** The page is kept for 5 minutes and refreshed in the background, so most visitors never wait for the database. A change to products shows within about 5 minutes. A shop that's off, or doesn't exist, isn't kept by the browser, so turning it on works straight away.

A full page of 48 products is under 20 KB once compressed. A unit test enforces that budget.

## Security

- The page is read on the server with the service role, only for a business that turned its shop on, and only public fields.
- Everything the business typed is escaped.
- Photos are only served from WazaBolt's own storage and that business's folder. Another business's photo, or a hidden product's, gets a 404.
- Turning the page on or off is limited to owners and admins (`set_shop_enabled`), and it's audited (`shop.enabled` / `shop.disabled`).

## Changes

- **Migration** `20261101120000_shop_page.sql`:
  - the column `businesses.shop_enabled` (off by default);
  - the function `set_shop_enabled`.

  It's additive.
- `lib/shop/`:
  - `data.ts`: reading the shop and its photos;
  - `render.ts`: the HTML;
  - `types.ts`: the shared types.
- `app/s/[slug]/route.ts` (the page) and `app/s/[slug]/img/[id]/route.ts` (the photos).
- `proxy.ts`: `/s/` pages skip the session and language redirects, so they can be cached.
- Settings → Shop page (`lib/actions/shop.ts`), with English and French text.

## Tests

- **SQL** (`supabase/tests/shop_page.sql`, 3 checks): off by default; only an owner or admin turns it on (agents and other businesses are refused); audited.
- **Unit** (`tests/unit/shop.test.ts`, 8 checks):
  - the size budget, with no framework scripts or fonts;
  - prices, order links and WhatsApp messages;
  - out of stock and options;
  - escaping, and no stock quantities;
  - search without JavaScript, categories and pages;
  - language, no WhatsApp number, branches, and the not-found page.
- **E2E** (`tests/e2e/shop.e2e.mjs`, 19 checks), with a real owner:
  - the shop is off, then turned on in Settings;
  - a visitor without an account sees the products, prices and order links, and not the hidden product;
  - photos are shrunk;
  - another business's photos aren't served;
  - search works with JavaScript turned off;
  - turning the shop off takes the page down.

## Poster, WhatsApp Status image and sitemap (2 November 2026)

Once the shop is on, **Settings → Shop page** also offers:

- **Print a QR code poster** (`/s/<name>/poster`): one A4 page with:
  - the logo, name and city;
  - "Scan to see our products and order on WhatsApp";
  - a large QR code of the shop link, and the link written out.

  It's in the business's language (`?lang=` switches it), and the Print button isn't printed. The QR code uses error correction Q (25%), so a creased or dirty print still scans. It's drawn in the page as a small SVG, so there's nothing else to download.
- **Image for WhatsApp Status** (`/s/<name>/status.png`): a 1080 × 1920 picture with the logo, name, city, the same message, the QR code and the link. The top and bottom stay clear, where WhatsApp puts its own buttons. It's cached for an hour.
- **Search engines:** the shops that are on are listed in `/s/sitemap.xml`, and `robots.txt` points to it next to the site's own sitemap. It's read on each request and cached for an hour at the CDN, so a shop that's turned off drops out within the hour (its page answers 404 straight away).

All three answer 404 for a shop that's off.

**Code:** `lib/shop/qr.ts` (QR code to SVG, with the free `uqr` library, MIT, no dependencies), `lib/shop/poster.ts`, `app/s/[slug]/poster/route.ts`, `app/s/[slug]/status.png/route.tsx`, `app/s/sitemap.xml/route.ts`, and `loadShopCard` / `listOpenShops` in `lib/shop/data.ts`.

**Tests:**
- **Unit** (`tests/unit/shop-extras.test.ts`, 6 checks): the QR code is read back with a real QR reader (`jsqr`, test-only), including at about 2 cm; the poster's content, escaping, A4 print layout and noindex.
- **E2E** (`tests/e2e/shop.e2e.mjs`, now 29 checks): the Settings links; the poster's QR code read from a screenshot; the poster prints on one A4 page without the button; the Status image is 1080 × 1920 and its QR code opens the shop; the sitemap lists the shop; all three disappear when the shop is turned off.

## Next ideas (not built)

- A "Share this shop" link preview image (Open Graph) for shops without a logo.
