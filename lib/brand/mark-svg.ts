/*
 * Static SVG strings for the WazaBolt symbol (favicons, app icons, Open
 * Graph and social images). Same geometry as components/brand/logo.tsx.
 */
import { MARK_BOLT_PATH, MARK_BUBBLE_PATH, MARK_W_PATH } from "@/components/brand/logo";

export const brandHex = {
  green: "#16B878",
  green400: "#3CC991",
  deep: "#102A2A",
  gold: "#FFC83D",
  coral: "#FF6B4A",
  mint: "#E9FAF3",
  cream: "#FFFDF8",
  slate: "#526262",
} as const;

export function markSvg({ size, knockout = brandHex.cream, background }: { size?: number; knockout?: string; background?: string } = {}) {
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const bg = background ? `<rect x="-6" y="-6" width="60" height="60" rx="14" fill="${background}"/>` : "";
  const viewBox = background ? "-6 -6 60 60" : "0 0 48 48";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none"${dims}><defs><linearGradient id="g" x1="6" y1="8" x2="36" y2="46" gradientUnits="userSpaceOnUse"><stop stop-color="#1FC985"/><stop offset="1" stop-color="#0E8A5A"/></linearGradient></defs>${bg}<path d="${MARK_BUBBLE_PATH}" fill="url(#g)"/><path d="${MARK_W_PATH}" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${MARK_BOLT_PATH}" fill="${brandHex.gold}" stroke="${knockout}" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/></svg>`;
}
