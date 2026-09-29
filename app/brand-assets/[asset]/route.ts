import { renderSocialImage, socialFormats, type SocialFormat } from "@/lib/brand/social-image";

/**
 * Downloadable social templates, generated at build time:
 *   /brand-assets/facebook-cover.png   (1640×624)
 *   /brand-assets/instagram-post.png   (1080×1080)
 *   /brand-assets/instagram-story.png  (1080×1920)
 * The WhatsApp Business profile image is static: /logo/wazabolt-whatsapp-profile.png
 */
const assets = ["facebook-cover", "instagram-post", "instagram-story"] as const satisfies readonly SocialFormat[];

export function generateStaticParams() {
  return assets.map((name) => ({ asset: `${name}.png` }));
}

export const dynamicParams = false;

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const name = asset.replace(/\.png$/, "") as SocialFormat;
  if (!(assets as readonly string[]).includes(name) || !(name in socialFormats)) {
    return new Response("Not found", { status: 404 });
  }
  return renderSocialImage(name);
}
