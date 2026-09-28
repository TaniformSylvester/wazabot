import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";
import { brandHex, markSvg } from "@/lib/brand/mark-svg";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [bold, extraBold] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Sora-Bold-latin.woff")),
    readFile(join(process.cwd(), "assets/fonts/Sora-ExtraBold-latin.woff")),
  ]);
  const mark = `data:image/svg+xml;base64,${Buffer.from(markSvg({ tile: false, size: 200 })).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `radial-gradient(circle at 88% 12%, rgba(255,176,32,0.35), transparent 45%), radial-gradient(circle at 95% 95%, rgba(242,85,29,0.3), transparent 40%), ${brandHex.ink}`,
          color: brandHex.sand,
          fontFamily: "Sora",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={mark} width={96} height={96} alt="" />
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: -2.5 }}>
            <span>Waza</span>
            <span style={{ color: brandHex.bolt400 }}>Bolt</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3.5, maxWidth: 900 }}>
            {siteConfig.tagline}
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "rgba(250,247,240,0.7)" }}>
            {siteConfig.positioning}
          </div>
        </div>
        <div style={{ display: "flex", height: 10, borderRadius: 999, background: `linear-gradient(90deg, ${brandHex.bolt400}, ${brandHex.ember500})` }} />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Sora", data: bold, weight: 700, style: "normal" },
        { name: "Sora", data: extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
