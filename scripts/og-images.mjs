/*
 * Link-preview images as small JPEGs (public/og/wazabolt-<locale>.jpg).
 * WhatsApp skips preview images over ~300 KB, and the generated PNG
 * (app/[lang]/opengraph-image.tsx) is ~700 KB. Re-run after changing the
 * hero headline or the social image, with the app running:
 *
 *   APP_URL=http://localhost:3000 node scripts/og-images.mjs
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const APP = process.env.APP_URL ?? "http://localhost:3000";
for (const locale of ["en", "fr"]) {
  const res = await fetch(`${APP}/${locale}/opengraph-image`);
  if (!res.ok) throw new Error(`${locale}: ${res.status}`);
  const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (jpeg.length > 250_000) throw new Error(`${locale}: ${jpeg.length} bytes, too big for WhatsApp`);
  writeFileSync(`public/og/wazabolt-${locale}.jpg`, jpeg);
  console.log(`public/og/wazabolt-${locale}.jpg ${Math.round(jpeg.length / 1024)} KB`);
}
