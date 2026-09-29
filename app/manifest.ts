import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { brandHex } from "@/lib/brand/mark-svg";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — ${siteConfig.positioning}`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: brandHex.cream,
    theme_color: brandHex.deep,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/logo/wazabolt-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo/wazabolt-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
