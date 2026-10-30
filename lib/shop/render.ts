import { WEEKDAYS } from "@/lib/business/hours";
import type { Locale } from "@/lib/i18n/config";
import { currencyLabel, format, formatNumber } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";

import { SHOP_PAGE_SIZE, type Shop } from "./types";

/*
 * The shop page as one small HTML document, built for weak connections and
 * cheap phones: no framework JavaScript, the phone's own fonts, styles in the
 * page, a few lines of script for live search (the search also works without
 * it), and small photos that load as the visitor scrolls. Every value from
 * the business is escaped.
 */

type Text = Messages["shop"];

export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const money = (amount: number, currency: string, locale: Locale) => `${formatNumber(amount, locale)} ${currencyLabel(currency)}`;
const wa = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

const CSS = `*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#102a2a;background:#fffdf8}a{color:#0c8354}
header{background:#102a2a;color:#fff;padding:16px}header a{color:#fff}.top{display:flex;gap:12px;align-items:center;max-width:960px;margin:0 auto}
.logo{width:56px;height:56px;border-radius:14px;object-fit:cover;background:#16b878;flex:none}.lt{display:grid;place-items:center;font:700 24px system-ui;color:#102a2a}
h1{margin:0;font-size:20px;line-height:1.2}.sub{margin:2px 0 0;font-size:13px;color:#cfe0dc}.open{color:#7ee2b4}.shut{color:#ffc83d}
main{max-width:960px;margin:0 auto;padding:12px 12px 96px}.about{margin:4px 0 12px;color:#526262}
form{display:flex;gap:8px;margin:8px 0}input{flex:1;min-width:0;height:44px;border:1px solid #c9d6d0;border-radius:12px;padding:0 12px;font:inherit;background:#fff}
button{height:44px;border:0;border-radius:12px;padding:0 14px;font:600 15px system-ui;background:#102a2a;color:#fff}
.cats{display:flex;gap:6px;overflow-x:auto;padding:4px 0 8px}.cats a{flex:none;padding:6px 12px;border-radius:99px;background:#e9faf3;text-decoration:none;font-size:13px;font-weight:600}.cats a.on{background:#102a2a;color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:0;margin:0;list-style:none}
.card{display:flex;flex-direction:column;background:#fff;border:1px solid #e3e9e5;border-radius:14px;overflow:hidden}
.ph{aspect-ratio:1;width:100%;object-fit:cover;background:#e9faf3;display:block}.pl{display:grid;place-items:center;font:700 32px system-ui;color:#0c8354}
.in{padding:8px 10px 10px;display:flex;flex-direction:column;gap:2px;flex:1}.nm{font-weight:600;font-size:14px}.pr{font-weight:700}.mt{font-size:12px;color:#526262}.out{font-size:12px;font-weight:700;color:#e8532f}
.ord{margin-top:auto;display:block;text-align:center;padding:9px 6px;border-radius:10px;background:#16b878;color:#102a2a;font-weight:700;font-size:13px;text-decoration:none}
.muted{color:#526262}.box{margin:18px 0;padding:12px;border:1px solid #e3e9e5;border-radius:14px;background:#fff}.box h2{margin:0 0 6px;font-size:15px}.box p{margin:2px 0;font-size:13px}
.pg{display:flex;justify-content:space-between;align-items:center;margin:16px 0;font-size:14px}
.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 12px;background:#fffdf8;border-top:1px solid #e3e9e5}.bar a{display:block;max-width:560px;margin:0 auto;text-align:center;padding:12px;border-radius:12px;background:#16b878;color:#102a2a;font-weight:700;text-decoration:none}
footer{text-align:center;font-size:12px;padding:8px 0 24px}.lang{float:right;font-size:13px}`;

// Live search on the page already loaded (the form still works without it).
const SCRIPT = `var i=document.getElementById("q"),c=[].slice.call(document.querySelectorAll(".card"));if(i&&c.length){i.addEventListener("input",function(){var v=i.value.trim().toLowerCase();c.forEach(function(e){e.parentNode.hidden=v&&e.getAttribute("data-s").indexOf(v)<0})})}`;

export type RenderOptions = {
  locale: Locale;
  t: Text;
  /** Absolute URL of the page (canonical, share image). */
  url: string;
  q?: string;
  category?: string;
};

export function renderShop(shop: Shop, o: RenderOptions): string {
  const { t, locale } = o;
  const base = `/s/${shop.slug}`;
  const link = (params: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ lang: locale === shop.defaultLocale ? undefined : locale, ...params })) if (v !== undefined && String(v) !== "") sp.set(k, String(v));
    const s = sp.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };
  const initial = (name: string) => esc(name.trim().charAt(0).toUpperCase() || "?");
  const where = [shop.address, shop.city].filter(Boolean).join(", ");
  const status = shop.openNow === null ? "" : shop.openNow ? `<span class="open">${esc(t.openNow)}</span>` : `<span class="shut">${esc(t.closedNow)}</span>`;
  const other: Locale = locale === "fr" ? "en" : "fr";

  const cards = shop.products
    .map((p) => {
      const price = money(p.price, shop.currency, locale);
      const priceText = p.priceFrom ? format(t.from, { price }) : price;
      const order = shop.whatsapp && p.inStock ? wa(shop.whatsapp, format(t.orderMessage, { business: shop.name, product: p.name, price: priceText })) : null;
      const photo = p.photo
        ? `<img class="ph" src="${base}/img/${p.id}?v=${p.photo}" alt="${esc(p.name)}" width="300" height="300" loading="lazy" decoding="async">`
        : `<div class="ph pl" aria-hidden="true">${initial(p.name)}</div>`;
      return `<li><div class="card" data-s="${esc(`${p.name} ${p.category ?? ""}`.toLowerCase())}">${photo}<div class="in"><span class="nm">${esc(p.name)}</span><span class="pr">${esc(priceText)}</span>${
        p.hasOptions ? `<span class="mt">${esc(t.options)}</span>` : ""
      }${p.inStock ? "" : `<span class="out">${esc(t.outOfStock)}</span>`}${order ? `<a class="ord" href="${esc(order)}" rel="nofollow">${esc(t.order)}</a>` : ""}</div></div></li>`;
    })
    .join("");

  const pages = Math.max(1, Math.ceil(shop.total / SHOP_PAGE_SIZE));
  const pager =
    pages > 1
      ? `<nav class="pg">${shop.page > 1 ? `<a href="${esc(link({ q: o.q, cat: o.category, page: shop.page - 1 }))}">← ${esc(t.previous)}</a>` : "<span></span>"}<span class="muted">${esc(format(t.pageOf, { page: shop.page, pages }))}</span>${
          shop.page < pages ? `<a href="${esc(link({ q: o.q, cat: o.category, page: shop.page + 1 }))}">${esc(t.next)} →</a>` : "<span></span>"
        }</nav>`
      : "";

  const cats = shop.categories.length > 1
    ? `<nav class="cats">${[`<a href="${esc(link({}))}"${!o.category && !o.q ? ' class="on"' : ""}>${esc(t.all)}</a>`, ...shop.categories.map((c) => `<a href="${esc(link({ cat: c }))}"${o.category === c ? ' class="on"' : ""}>${esc(c)}</a>`)].join("")}</nav>`
    : "";

  const hours = WEEKDAYS.filter((d) => shop.openingHours[d])
    .map((d) => {
      const h = shop.openingHours[d]!;
      return `${esc(t.days[d])} ${h.closed ? esc(t.closed) : `${h.open}–${h.close}`}`;
    })
    .join(" · ");
  const branches = shop.branches.length
    ? `<section class="box"><h2>${esc(t.branches)}</h2>${shop.branches
        .map((b) => `<p><b>${esc(b.name)}</b>${[b.address, b.city].filter(Boolean).length ? ` · ${esc([b.address, b.city].filter(Boolean).join(", "))}` : ""}${b.phone ? ` · ${esc(b.phone)}` : ""}${b.hours ? ` · ${esc(b.hours)}` : ""}</p>`)
        .join("")}</section>`
    : "";

  const title = format(t.title, { name: shop.name });
  const description = shop.description?.slice(0, 160) || format(t.metaDescription, { name: shop.name });
  const logoUrl = shop.logo ? `${base}/img/logo?v=${shop.logo}` : null;
  const empty = shop.total === 0 ? `<p class="muted">${esc(o.q || o.category ? t.noResults : t.empty)}</p>` : "";

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(o.url)}"><meta name="theme-color" content="#102a2a"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(o.url)}">${
    logoUrl ? `<meta property="og:image" content="${esc(new URL(logoUrl, o.url).toString())}">` : ""
  }<link rel="icon" href="/icon.svg"><style>${CSS}</style></head><body><header><div class="top">${
    logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="" width="56" height="56">` : `<div class="logo lt" aria-hidden="true">${initial(shop.name)}</div>`
  }<div><h1>${esc(shop.name)}</h1><p class="sub">${[where && esc(where), status].filter(Boolean).join(" · ")}</p></div></div></header><main><a class="lang" href="${esc(
    `${base}?lang=${other}`,
  )}" hreflang="${other}">${other === "fr" ? "Français" : "English"}</a>${shop.description ? `<p class="about">${esc(shop.description)}</p>` : ""}<form method="get" action="${base}" role="search">${
    locale !== shop.defaultLocale ? `<input type="hidden" name="lang" value="${locale}">` : ""
  }<input id="q" name="q" type="search" value="${esc(o.q)}" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" autocomplete="off"><button>${esc(t.searchButton)}</button></form>${
    o.q ? `<p class="muted">${esc(format(t.results, { count: formatNumber(shop.total, locale) }))} · <a href="${esc(link({}))}">${esc(t.clear)}</a></p>` : ""
  }${cats}${empty}<ul class="grid">${cards}</ul>${pager}${
    hours ? `<section class="box"><h2>${esc(t.hours)}</h2><p>${hours}</p></section>` : ""
  }${branches}${shop.whatsapp ? "" : `<p class="muted">${esc(t.noWhatsApp)}</p>`}<footer><a href="https://www.wazabolt.com/${locale}?ref=shop">${esc(t.poweredBy)}</a></footer></main>${
    shop.whatsapp ? `<div class="bar"><a href="${esc(wa(shop.whatsapp, format(t.chatMessage, { business: shop.name })))}">${esc(t.chat)}</a></div>` : ""
  }<script>${SCRIPT}</script></body></html>`;
}

/** A small page for a shop that doesn't exist or is switched off. */
export function renderShopNotFound(t: Text, locale: Locale): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.notFoundTitle)}</title><style>${CSS}</style></head><body><main><h1>${esc(t.notFoundTitle)}</h1><p class="muted">${esc(t.notFound)}</p><footer><a href="https://www.wazabolt.com/${locale}?ref=shop">${esc(t.poweredBy)}</a></footer></main></body></html>`;
}
