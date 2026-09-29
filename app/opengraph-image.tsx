import { siteConfig } from "@/config/site";
import { renderSocialImage, socialFormats } from "@/lib/brand/social-image";

export const alt = `${siteConfig.name} — ${siteConfig.headline} ${siteConfig.supporting}`;
export const size = { width: socialFormats.og.width, height: socialFormats.og.height };
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderSocialImage("og");
}
