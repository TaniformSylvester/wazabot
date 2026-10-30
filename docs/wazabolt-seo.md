# WazaBolt — SEO (25 October 2026)

The aim is for people searching in Cameroon, in English or French, to find WazaBolt. Typical searches:

- "logiciel de gestion de stock Cameroun";
- "facture en FCFA";
- "school report card software Cameroon";
- "logiciel restaurant Douala".

## What the site now does

**Titles and descriptions.** Every public page has its own title and description in both languages, written around what people search for:

- sales, stock and customer credit;
- invoices and receipts in FCFA;
- schools, restaurants and shops;
- WhatsApp AI in English, French and Pidgin.

The old descriptions talked only about the WhatsApp assistant, and the Pricing one ("AI usage is metered") was out of date.

**Landing pages for each business type**, in English and French. They describe only features that exist, with no invented figures:

- `/solutions/retail`: shops and boutiques;
- `/solutions/schools`: marks, report cards and fees;
- `/solutions/restaurants`: tables, kitchen screen and bills.

Each page has six features and three questions. The pages are linked from Solutions, from the home page cards and from the sitemap.

**Link previews.** Every page has its own share title, link and preview image. Before, inner pages such as Pricing and Features had no image when shared on WhatsApp or Facebook, and every page used the home page's Twitter text.

**Preview image size.** The share image is a JPEG of about 75 KB in `public/og/` (`wazabolt-en.jpg`, `wazabolt-fr.jpg`). The generated PNG was about 700 KB, and WhatsApp leaves the preview out when the image is over about 300 KB.

- The headline in the image now shrinks to fit. The current hero text, the French one above all, overflowed the bottom of the image.
- After changing the hero headline, regenerate the JPEGs with the app running: `node scripts/og-images.mjs`.
- WhatsApp keeps a preview for each link once it has made one. To see a new preview, test with a link you haven't sent before, e.g. `…/en/pricing?v=2`.

**Structured data (schema.org)** helps Google show richer results:

- **Every page:** WazaBolt as an organisation, with the Bamenda address, phone, email and WhatsApp link.
- **Home and Pricing:** the product with every plan and its FCFA price.
- **FAQ and the landing pages:** their questions and answers (FAQPage).
- **Inner pages:** a breadcrumb trail (Home › Solutions › For schools).

No ratings or review counts are included: there aren't any to show.

**Headings and robots.**

- The FAQ page now has a main heading (h1).
- The WazaBolt admin pages are now in robots.txt next to the dashboard, so they stay out of search.
- In the sitemap, the landing pages, Pricing and the free document tool rank above the legal pages.

**Search Console verification.** The site can carry the verification tags for Google and Bing. Set them in Vercel (see below); nothing is hard-coded.

**Test.** `npm run test:e2e:seo` checks every public page in both languages:

- title, description, canonical link and EN/FR alternates;
- share tags;
- structured data that parses;
- the sitemap and robots.txt.

## What only you can do (most of the effect comes from here)

Code makes the site readable by Google. Ranking and being known come from these steps.

### 1. Check the site address in Vercel

In Vercel → wazabot → Settings → Environment Variables (Production), `NEXT_PUBLIC_SITE_URL` must be the real address, for example `https://wazabolt.com`, with no trailing slash.

Every canonical link, the sitemap and the structured data use it. If it's missing, they point to `localhost`, and Google ignores the pages.

### 2. Google Search Console (free)

1. Go to search.google.com/search-console and add the property for your domain.
2. Choose **HTML tag** verification and copy only the `content` value, e.g. `abc123…`.
3. In Vercel, add `GOOGLE_SITE_VERIFICATION` = that value (Production), then redeploy.
4. Click **Verify**.
5. Under **Sitemaps**, submit `https://<your domain>/sitemap.xml`.
6. Under **URL inspection**, request indexing for the home page and the three landing pages.

### 3. Bing Webmaster Tools (free, also feeds other search engines)

1. Sign in at bing.com/webmasters. You can import the site from Search Console.
2. If it asks for a meta tag, set `BING_SITE_VERIFICATION` in Vercel, the same way as Google.

### 4. Google Business Profile (free; the biggest win for local searches)

1. Create a profile at business.google.com:
   - name: WazaBolt;
   - category: Software company;
   - address: Mawa Hotel Junction, opposite Mawa Hotel, Mile 6 Nkwen, Bamenda III;
   - phone: +237 675 12 98 68;
   - website: your domain.
2. Use exactly the same name, address and phone as on the site.
3. Ask your first customers to leave a Google review.

### 5. Be mentioned on other sites (backlinks)

Every link from a trusted site helps. Some places to start:

- Facebook and Instagram pages: done (25 October 2026). They're linked in the footer and in the structured data (`sameAs`, from `siteConfig.social`). Put `https://www.wazabolt.com` in both profiles too. A LinkedIn page can be added the same way.
- Cameroonian business directories, startup lists, the chambers of commerce, and local tech communities in Bamenda, Buea, Douala and Yaoundé.
- A short article or interview in local tech or business media.
- Customers' sites and pages ("Our receipts are made with WazaBolt").

### 6. Share the free invoice tool

`/tools/documents` makes invoices, receipts and quotations in FCFA, free and without an account. It's the page most likely to be searched and shared, so post it in WhatsApp groups, Facebook groups for traders, and so on.

## Possible next steps

- Short guides in the Resources section, in English and French. People search these questions, for example:
  - "How to make an invoice in FCFA";
  - "How to follow customer credit";
  - "How to calculate a student's average out of 20".
- Landing pages for other business types (hotels, salons, real estate) once they have real features of their own.
- Update the Pricing page intro ("Pay for what your customers use… AI conversations"). It's visible copy, not search text, so it wasn't changed here.
