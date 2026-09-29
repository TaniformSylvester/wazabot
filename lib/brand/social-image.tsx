/* eslint-disable @next/next/no-img-element -- Satori (next/og) renders plain <img>; next/image does not apply. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";
import { brandHex, markSvg } from "@/lib/brand/mark-svg";

/*
 * WazaBolt social templates, rendered to PNG with next/og (Satori).
 * One layout system for Open Graph, Facebook and Instagram so every shared
 * image carries the same logo, colours, type and message.
 *
 * Satori note: gradients fade to explicit rgba(…, 0) colours, never
 * `transparent` (which interpolates through black and looks muddy).
 */

type Format = {
  width: number;
  height: number;
  theme: "light" | "dark";
  layout: "wide" | "stacked";
  headline: number;
  photo: [number, number];
  justify: "space-between" | "center";
};

export const socialFormats = {
  og: { width: 1200, height: 630, theme: "light", layout: "wide", headline: 72, photo: [380, 460], justify: "space-between" },
  "facebook-cover": { width: 1640, height: 624, theme: "dark", layout: "wide", headline: 72, photo: [380, 460], justify: "center" },
  "instagram-post": { width: 1080, height: 1080, theme: "light", layout: "stacked", headline: 74, photo: [520, 430], justify: "space-between" },
  "instagram-story": { width: 1080, height: 1920, theme: "dark", layout: "stacked", headline: 96, photo: [780, 900], justify: "space-between" },
} as const satisfies Record<string, Format>;

export type SocialFormat = keyof typeof socialFormats;

async function assets() {
  const root = process.cwd();
  const [bold, extraBold, photo, product] = await Promise.all([
    readFile(join(root, "assets/fonts/PlusJakartaSans-Bold-latin.woff")),
    readFile(join(root, "assets/fonts/PlusJakartaSans-ExtraBold-latin.woff")),
    readFile(join(root, "assets/hero-owner.jpg")),
    readFile(join(root, "assets/product-robe-wax.jpg")),
  ]);
  return {
    bold,
    extraBold,
    photo: `data:image/jpeg;base64,${photo.toString("base64")}`,
    product: `data:image/jpeg;base64,${product.toString("base64")}`,
  };
}

const dataSvg = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** Text on the image. Defaults to the English brand copy; the Open Graph image passes the page locale's copy. */
export type SocialCopy = {
  tagline: string;
  /** Headline with the highlighted part in <hl>…</hl>. */
  headline: string;
  supporting: string;
  positioning: string;
  productMeta: string;
  orderNow: string;
};

const defaultCopy: SocialCopy = {
  tagline: siteConfig.tagline,
  headline: "Power your business on <hl>WhatsApp.</hl>",
  supporting: siteConfig.supporting,
  positioning: siteConfig.positioning,
  productMeta: "15,000 FCFA · Size L",
  orderNow: "Order Now",
};

export async function renderSocialImage(format: SocialFormat, copy: SocialCopy = defaultCopy) {
  const [before, highlight = "", after = ""] = copy.headline.split(/<\/?hl>/);
  const f: Format = socialFormats[format];
  const a = await assets();
  const dark = f.theme === "dark";
  const stacked = f.layout === "stacked";

  const text = dark ? "#FFFFFF" : brandHex.deep;
  const muted = dark ? "rgba(255,255,255,0.72)" : brandHex.slate;
  const icon = dataSvg(markSvg({ size: 200, knockout: dark ? brandHex.deep : brandHex.cream }));
  const [pw, ph] = f.photo;

  const logo = (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <img src={icon} width={80} height={80} alt="" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 52, fontWeight: 800, letterSpacing: -1.8, lineHeight: 1 }}>
          <span style={{ color: text }}>Waza</span>
          <span style={{ color: dark ? brandHex.green400 : brandHex.green }}>Bolt</span>
        </div>
        <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: muted, marginTop: 8 }}>{copy.tagline}</div>
      </div>
    </div>
  );

  const message = (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          fontSize: f.headline,
          fontWeight: 800,
          letterSpacing: -2.4,
          lineHeight: 1.04,
          color: text,
          maxWidth: stacked ? 920 : 620,
        }}
      >
        <span>{before.replace(/ $/, "\u00a0")}</span>
        <span style={{ color: dark ? brandHex.green400 : "#12A06A" }}>{highlight}</span>
        {after ? <span>{after}</span> : null}
      </div>
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          background: brandHex.gold,
          color: brandHex.deep,
          fontSize: 26,
          fontWeight: 800,
          padding: "10px 22px",
          borderRadius: 999,
        }}
      >
        {copy.supporting}
      </div>
    </div>
  );

  const visual = (
    <div style={{ display: "flex", position: "relative", width: pw + 20, height: ph + 20 }}>
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          width: pw,
          height: ph,
          borderRadius: 36,
          background: `linear-gradient(125deg, ${brandHex.green400}, ${brandHex.green} 55%, ${brandHex.gold})`,
        }}
      />
      <img
        src={a.photo}
        width={pw}
        height={ph}
        alt=""
        style={{ position: "absolute", top: 0, left: 0, borderRadius: 34, objectFit: "cover", objectPosition: "center 25%" }}
      />
      <div
        style={{
          position: "absolute",
          left: -56,
          bottom: 40,
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: "#FFFFFF",
          borderRadius: 20,
          padding: 12,
          boxShadow: "0 18px 40px rgba(16,42,42,0.25)",
        }}
      >
        <img src={a.product} width={56} height={68} alt="" style={{ borderRadius: 10, objectFit: "cover" }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 18, fontWeight: 800, color: brandHex.deep }}>Robe en wax</div>
          <div style={{ display: "flex", fontSize: 16, fontWeight: 700, color: brandHex.slate }}>{copy.productMeta}</div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontSize: 14,
              fontWeight: 800,
              color: brandHex.deep,
              background: brandHex.green,
              borderRadius: 8,
              padding: "5px 14px",
            }}
          >
            {copy.orderNow}
          </div>
        </div>
      </div>
    </div>
  );

  const background = dark
    ? `radial-gradient(circle at 88% 12%, rgba(22,184,120,0.32), rgba(22,184,120,0) 45%), radial-gradient(circle at 5% 100%, rgba(255,200,61,0.16), rgba(255,200,61,0) 40%), ${brandHex.deep}`
    : `radial-gradient(circle at 88% 15%, rgba(233,250,243,1), rgba(233,250,243,0) 55%), radial-gradient(circle at 8% 100%, rgba(255,241,204,1), rgba(255,241,204,0) 45%), ${brandHex.cream}`;

  const pad = stacked ? 72 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "stretch" : "center",
          justifyContent: f.justify,
          padding: pad,
          background,
          fontFamily: "Plus Jakarta Sans",
          gap: stacked ? 36 : 120,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 40, height: stacked ? "auto" : "100%" }}>
          {logo}
          {message}
          {!stacked ? <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: muted }}>{copy.positioning}</div> : null}
        </div>
        {stacked ? <div style={{ display: "flex", justifyContent: "center" }}>{visual}</div> : visual}
        {stacked ? (
          <div style={{ display: "flex", justifyContent: "center", fontSize: 26, fontWeight: 700, color: muted }}>{copy.positioning}</div>
        ) : null}
      </div>
    ),
    {
      width: f.width,
      height: f.height,
      fonts: [
        { name: "Plus Jakarta Sans", data: a.bold, weight: 700, style: "normal" },
        { name: "Plus Jakarta Sans", data: a.extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
