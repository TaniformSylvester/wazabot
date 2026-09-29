import { siteConfig } from "@/config/site";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/load";
import { renderSocialImage, socialFormats } from "@/lib/brand/social-image";

/** The file convention allows one static alt per image; the image itself is localized. */
export const alt = `${siteConfig.name} — ${siteConfig.headline} ${siteConfig.supporting}`;
export const size = { width: socialFormats.og.width, height: socialFormats.og.height };
export const contentType = "image/png";

/** Link preview image, in the page's language. */
export default async function OpengraphImage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const t = await getDictionary(isLocale(lang) ? lang : "en");
  return renderSocialImage("og", {
    tagline: t.common.brand.tagline,
    headline: t.hero.title,
    supporting: t.common.brand.supporting,
    positioning: t.common.brand.positioning,
    productMeta: t.chatMockup.productMeta,
    orderNow: t.chatMockup.orderNow,
  });
}
