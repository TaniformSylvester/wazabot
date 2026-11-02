import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";

import type { ShopCard } from "./data";
import { qrSvg } from "./qr";
import { esc } from "./render";

/*
 * The printable QR code poster of a shop: one A4 page, plain HTML with the
 * QR code drawn in the page (nothing to download but the page itself), the
 * phone's own fonts, and a Print button that isn't printed.
 */

const CSS = `@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#e9efec}body{font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#102a2a}
.np{max-width:210mm;margin:0 auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between}.np p{margin:0;font-size:14px;color:#526262;flex:1 1 260px}
.np button{height:44px;border:0;border-radius:12px;padding:0 20px;font:700 16px system-ui;background:#102a2a;color:#fff;cursor:pointer}
.sheet{width:210mm;max-width:100%;aspect-ratio:210/297;margin:0 auto 24px;background:#fffdf8;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:14mm 12mm 10mm;text-align:center;box-shadow:0 2px 12px rgba(16,42,42,.12)}
.logo{width:26mm;height:26mm;border-radius:6mm;object-fit:cover;background:#16b878}.lt{display:grid;place-items:center;font:800 14mm system-ui;color:#102a2a}
h1{margin:4mm 0 0;font-size:13mm;line-height:1.1;overflow-wrap:anywhere}.city{margin:1mm 0 0;font-size:6mm;color:#526262}
.hl{margin:0;font-size:10mm;font-weight:800;line-height:1.15}.sub{margin:1mm 0 0;font-size:7mm;color:#0c8354;font-weight:700}
.qr{width:115mm;max-width:80%;padding:4mm;border:1.2mm solid #16b878;border-radius:6mm;background:#fff}.qr svg{display:block;width:100%;height:auto}
.url{margin:0;font-size:5.5mm;color:#526262}.url b{color:#102a2a;overflow-wrap:anywhere}.by{margin:0;font-size:3.6mm;color:#526262}
@media print{html,body{background:#fff}.np{display:none}.sheet{width:210mm;height:297mm;max-width:none;margin:0;box-shadow:none}}`;

export function renderPoster(card: ShopCard, o: { locale: Locale; t: Messages["shop"]; url: string }): string {
  const { t, locale } = o;
  const logo = card.logo
    ? `<img class="logo" src="/s/${esc(card.slug)}/img/logo?v=${esc(card.logo)}" alt="" width="300" height="300">`
    : `<div class="logo lt" aria-hidden="true">${esc(card.name.trim().charAt(0).toUpperCase() || "?")}</div>`;
  const shown = o.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "");
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(
    format(t.posterTitle, { name: card.name }),
  )}</title><link rel="icon" href="/icon.svg"><style>${CSS}</style></head><body><div class="np"><p>${esc(t.posterTip)}</p><button type="button" onclick="print()">${esc(t.posterPrint)}</button></div><main class="sheet"><div>${logo}<h1>${esc(card.name)}</h1>${
    card.city ? `<p class="city">${esc(card.city)}</p>` : ""
  }</div><div><p class="hl">${esc(t.posterHeadline)}</p><p class="sub">${esc(t.posterSub)}</p></div><div class="qr" role="img" aria-label="${esc(o.url)}">${qrSvg(o.url)}</div><p class="url">${esc(t.posterOrOpen)} <b>${esc(shown)}</b></p><p class="by">${esc(t.poweredBy)}</p></main></body></html>`;
}
