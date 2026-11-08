/*
 * Search engines and link previews: every public page has its own title,
 * description, canonical link and EN/FR alternates, a share image, and
 * schema.org data that parses; the sitemap lists the landing pages; private
 * pages stay out of search. Plain HTTP, no browser.
 *
 *   APP_URL=http://localhost:3000 node tests/e2e/seo.e2e.mjs
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
const get = async (path) => {
  const r = await fetch(`${APP}${path}`, { redirect: "manual" });
  return { status: r.status, type: r.headers.get("content-type") ?? "", body: await r.text() };
};
const attr = (html, re) => html.match(re)?.[1] ?? null;
const meta = (html, key) => attr(html, new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`));
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].flatMap((m) => JSON.parse(m[1])["@graph"] ?? []);
const types = (html) => jsonLd(html).map((g) => g["@type"]);

const PAGES = ["/", "/features", "/how-it-works", "/solutions", "/solutions/retail", "/solutions/schools", "/solutions/restaurants", "/pricing", "/countries", "/countries/nigeria", "/countries/south-africa", "/countries/ghana", "/countries/kenya", "/countries/zimbabwe", "/tools/documents", "/faq", "/about", "/contact"];

(async () => {
  try {
    const titles = new Map();
    for (const locale of ["en", "fr"]) {
      for (const p of PAGES) {
        const path = `/${locale}${p === "/" ? "" : p}`;
        const { status, body } = await get(path);
        const title = attr(body, /<title>([^<]*)<\/title>/);
        const desc = meta(body, "description");
        const canonical = attr(body, /<link rel="canonical" href="([^"]*)"/);
        const issues = [
          status !== 200 && `status ${status}`,
          !title && "no title",
          (!desc || desc.length < 70 || desc.length > 320) && `description length ${desc?.length ?? 0}`,
          !canonical?.endsWith(path) && `canonical ${canonical}`,
          !/hrefLang="en"/.test(body) || !/hrefLang="fr"/.test(body) ? "missing hreflang" : null,
          !meta(body, "og:image") && "no og:image",
          meta(body, "og:url") && !meta(body, "og:url").endsWith(path) && `og:url ${meta(body, "og:url")}`,
          meta(body, "og:site_name") !== "WazaBolt" && "no og:site_name",
          !meta(body, "twitter:title") && "no twitter:title",
          !types(body).includes("Organization") && "no Organization data",
          !/<h1[\s>]/.test(body) && "no h1",
        ].filter(Boolean);
        ok(`${path}: title, description, canonical, alternates, share tags, organization`, issues.length === 0, issues.join(", "));
        if (titles.has(title)) ok(`${path}: title is unique`, false, `same as ${titles.get(title)}`);
        titles.set(title, path);
      }
    }

    const home = (await get("/en")).body;
    const app = jsonLd(home).find((g) => g["@type"] === "SoftwareApplication");
    ok("home: the product with every plan's FCFA price", app?.offers?.length === 3 && app.offers.every((o) => o.priceCurrency === "XAF") && JSON.stringify(app.offers.map((o) => o.price)) === "[3000,7500,15000]", JSON.stringify(app?.offers?.map((o) => o.price)));
    const org = jsonLd(home).find((g) => g["@type"] === "Organization");
    ok("organization: Bamenda address, phone and email", org?.address?.addressLocality === "Bamenda III" && org.address.addressCountry === "CM" && org.telephone === "+237 675 12 98 68" && org.email === "contact@wazabolt.com");
    ok("organization: its Facebook and Instagram pages (sameAs)", org?.sameAs?.some((u) => u.startsWith("https://www.facebook.com/")) && org.sameAs.includes("https://www.instagram.com/wazabolt/"), JSON.stringify(org?.sameAs));
    ok("footer links to Facebook and Instagram", /data-testid="footer-social"/.test(home) && home.includes('href="https://www.instagram.com/wazabolt/"') && home.includes("facebook.com/profile.php?id=61594928852496"));

    const faq = jsonLd((await get("/fr/faq")).body).find((g) => g["@type"] === "FAQPage");
    ok("FAQ: questions and answers as FAQPage (French on /fr)", faq?.mainEntity?.length >= 5 && faq.mainEntity.every((q) => q.name && q.acceptedAnswer?.text) && /WhatsApp/.test(faq.mainEntity[0].name));
    const school = (await get("/en/solutions/schools")).body;
    ok("school landing: FAQ and breadcrumb Home › Solutions › For schools", types(school).includes("FAQPage") && jsonLd(school).find((g) => g["@type"] === "BreadcrumbList")?.itemListElement?.length === 3);
    ok("school landing: says what the school module does", /report cards in PDF/i.test(school) && /out of 20 or out of 100/.test(school));
    ok("a business type without its own page is a 404", (await get("/en/solutions/hotels")).status === 404);

    // Countries outside Cameroon: a page each, with their currency, numbers and US dollar prices.
    const nigeria = (await get("/en/countries/nigeria")).body;
    const ngApp = jsonLd(nigeria).find((g) => g["@type"] === "SoftwareApplication");
    ok("Nigeria page: title and h1 say Nigeria and naira", /<title>[^<]*Nigeria[^<]*naira/.test(nigeria) && /<h1[^>]*>[^<]*in Nigeria/.test(nigeria));
    ok("Nigeria page: plans at $5, $12 and $25 (SoftwareApplication offers in USD, area served Nigeria)", ngApp?.areaServed?.name === "Nigeria" && ngApp.offers.every((o) => o.priceCurrency === "USD") && JSON.stringify(ngApp.offers.map((o) => o.price)) === "[5,12,25]", JSON.stringify(ngApp?.offers));
    ok("Nigeria page: +234 numbers, naira amounts, FAQ and breadcrumb Home › Countries › Nigeria", /\+234/.test(nigeria) && /15,000 NGN/.test(nigeria) && types(nigeria).includes("FAQPage") && jsonLd(nigeria).find((g) => g["@type"] === "BreadcrumbList")?.itemListElement?.length === 3);
    ok("Nigeria page: its sign-up button chooses Nigeria", nigeria.includes('href="/en/register?country=NG"'));
    const za = (await get("/fr/countries/south-africa")).body;
    ok("French: « en Afrique du Sud » (not « au »)", /en Afrique du Sud/.test(za) && !/au Afrique du Sud/.test(za));
    ok("a country WazaBolt doesn't sell in is a 404", (await get("/en/countries/france")).status === 404);
    const reg = (await get("/en/register?country=KE")).body;
    ok("sign-up from a country page has the country chosen", /<option value="KE" selected/.test(reg) || /value="KE"[^>]*selected/.test(reg), (reg.match(/<select[^>]*signup-country[\s\S]{0,600}/) || [""])[0].slice(0, 300));
    ok("organization serves the six countries", JSON.stringify(jsonLd(home).find((g) => g["@type"] === "Organization")?.areaServed?.map((c) => c.name)) === JSON.stringify(["Cameroon", "Zimbabwe", "Nigeria", "South Africa", "Ghana", "Kenya"]));
    ok("footer links to every country page", ["nigeria", "south-africa", "ghana", "kenya", "zimbabwe"].every((s) => home.includes(`href="/en/countries/${s}"`)));
    const pricing = (await get("/en/pricing")).body;
    ok("pricing: the US dollar prices outside Cameroon, linked to the country pages", /data-testid="pricing-outside"/.test(pricing) && /5\.00 USD, 12\.00 USD and 25\.00 USD a month/.test(pricing) && pricing.includes('href="/en/countries"'));
    const solutions = (await get("/en/solutions")).body;
    ok("solutions links to the three landing pages", ["retail", "schools", "restaurants"].every((s) => solutions.includes(`href="/en/solutions/${s}"`)));

    for (const locale of ["en", "fr"]) {
      const src = meta((await get(`/${locale}/pricing`)).body, "og:image");
      const img = src ? await fetch(src.replace(/^https?:\/\/[^/]+/, APP)) : null;
      const bytes = img ? (await img.arrayBuffer()).byteLength : 0;
      // WhatsApp leaves the preview out when the image is over ~300 KB.
      ok(`${locale}: share image is a small JPEG WhatsApp will show`, img?.status === 200 && img.headers.get("content-type") === "image/jpeg" && bytes > 10_000 && bytes < 300_000, `${src} ${bytes} bytes`);
    }

    const sitemap = (await get("/sitemap.xml")).body;
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    ok("sitemap: every public page in both languages", PAGES.every((p) => ["en", "fr"].every((l) => locs.some((u) => u.endsWith(`/${l}${p === "/" ? "" : p}`)))), `${locs.length} urls`);
    ok("sitemap: no private pages", !locs.some((u) => /dashboard|admin|login|register/.test(u)));
    const robots = (await get("/robots.txt")).body;
    ok("robots: dashboard and admin kept out, sitemap announced", /Disallow: \/dashboard/.test(robots) && /Disallow: \/en\/dashboard/.test(robots) && /Sitemap: .*\/sitemap\.xml/.test(robots), robots.replace(/\n/g, " | "));
    ok("robots: the WazaBolt admin pages are kept out too", /Disallow: \/admin/.test(robots) && /Disallow: \/fr\/admin/.test(robots));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
