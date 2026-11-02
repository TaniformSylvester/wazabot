/* eslint-disable @next/next/no-img-element -- Satori (next/og) renders plain <img>; next/image does not apply. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import { siteConfig } from "@/config/site";
import { MAX_IMAGE_INPUT_BYTES } from "@/lib/ai/images";
import { brandHex, markSvg } from "@/lib/brand/mark-svg";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { loadShopCard, shopPhotoSource } from "@/lib/shop/data";
import { qrSvg } from "@/lib/shop/qr";

/**
 * A picture of the shop for WhatsApp Status (1080 × 1920): name, logo, the
 * QR code and the link. The top and bottom stay clear, where WhatsApp puts its
 * own buttons. Cached for an hour at the CDN.
 */
const dataUri = (mime: string, bytes: Buffer | string) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

async function logoData(slug: string): Promise<string | null> {
  const source = await shopPhotoSource(slug, "logo");
  if (!source) return null;
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok || Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_INPUT_BYTES) return null;
    const png = await sharp(new Uint8Array(await res.arrayBuffer()), { limitInputPixels: 50_000_000, animated: false }).rotate().resize({ width: 240, height: 240, fit: "cover" }).png().toBuffer();
    return dataUri("image/png", png);
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: RouteContext<"/s/[slug]/status.png">) {
  const { slug } = await ctx.params;
  const asked = new URL(request.url).searchParams.get("lang");
  const card = await loadShopCard(slug.toLowerCase());
  if (!card) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=0, s-maxage=30" } });
  const locale = isLocale(asked) ? asked : card.defaultLocale;
  const t = (await getDictionary(locale)).shop;
  const url = `${siteConfig.url.replace(/\/$/, "")}/s/${card.slug}`;
  const root = process.cwd();
  const [bold, extraBold, logo] = await Promise.all([
    readFile(join(root, "assets/fonts/PlusJakartaSans-Bold-latin.woff")),
    readFile(join(root, "assets/fonts/PlusJakartaSans-ExtraBold-latin.woff")),
    card.logo ? logoData(card.slug) : Promise.resolve(null),
  ]);
  const name = card.name.length > 60 ? `${card.name.slice(0, 58)}…` : card.name;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "230px 80px 250px", background: brandHex.deep, color: "#fff", fontFamily: "Plus Jakarta Sans", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {logo ? (
            <img src={logo} width={200} height={200} alt="" style={{ borderRadius: 48 }} />
          ) : (
            <div style={{ width: 200, height: 200, borderRadius: 48, background: brandHex.green, color: brandHex.deep, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 110, fontWeight: 800 }}>
              {card.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div style={{ marginTop: 36, fontSize: name.length > 28 ? 64 : 84, fontWeight: 800, lineHeight: 1.1, maxWidth: 920, display: "flex", justifyContent: "center" }}>{name}</div>
          {card.city ? <div style={{ marginTop: 12, fontSize: 40, color: "#cfe0dc", fontWeight: 700 }}>{card.city}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.15, maxWidth: 900, color: brandHex.green400, display: "flex", justifyContent: "center" }}>{t.shareHeadline}</div>
          <div style={{ marginTop: 40, padding: 26, borderRadius: 48, background: "#fff", display: "flex" }}>
            <img src={dataUri("image/svg+xml", qrSvg(url, { size: 520 }))} width={520} height={520} alt="" />
          </div>
          <div style={{ marginTop: 32, fontSize: 36, fontWeight: 700, color: brandHex.gold, display: "flex", maxWidth: 920, justifyContent: "center" }}>{url.replace(/^https?:\/\/(www\.)?/, "")}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: "#cfe0dc", fontWeight: 700 }}>
          <img src={dataUri("image/svg+xml", markSvg({ size: 48, knockout: brandHex.deep }))} width={48} height={48} alt="" />
          {t.poweredBy}
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: [
        { name: "Plus Jakarta Sans", data: bold, weight: 700, style: "normal" },
        { name: "Plus Jakarta Sans", data: extraBold, weight: 800, style: "normal" },
      ],
      headers: { "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
