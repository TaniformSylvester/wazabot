import sharp from "sharp";

import { MAX_IMAGE_INPUT_BYTES } from "@/lib/ai/images";
import { shopPhotoSource } from "@/lib/shop/data";

/**
 * Small photos for the shop page: a product's photo (or the logo) shrunk to a
 * thumbnail, made once and then cached for a year by browsers and the CDN
 * (the URL carries the photo's version, so a new photo gets a new URL).
 */
const SIZE = { product: 300, logo: 112 };

export async function GET(_request: Request, ctx: RouteContext<"/s/[slug]/img/[id]">) {
  const { slug, id } = await ctx.params;
  const source = await shopPhotoSource(slug.toLowerCase(), id);
  if (!source) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok || Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_INPUT_BYTES) throw new Error("source");
    const edge = id === "logo" ? SIZE.logo : SIZE.product;
    const out = await sharp(new Uint8Array(await res.arrayBuffer()), { limitInputPixels: 50_000_000, animated: false })
      .rotate()
      .resize({ width: edge, height: edge, fit: "cover", withoutEnlargement: true })
      .webp({ quality: 60 })
      .toBuffer();
    return new Response(new Uint8Array(out), {
      headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
  }
}
