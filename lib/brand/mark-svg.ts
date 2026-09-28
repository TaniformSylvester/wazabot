/*
 * Static SVG strings for the WazaBolt mark, used for generated icons and
 * exported logo files. Same geometry as components/brand/logo.tsx.
 */
import { MARK_BOLT_PATH, MARK_W_PATH } from "@/components/brand/logo";

export const brandHex = {
  bolt400: "#FFC53D",
  bolt500: "#FFB020",
  bolt50: "#FFF8E6",
  ember500: "#F2551D",
  ember600: "#D9430F",
  ink: "#15120E",
  sand: "#FAF7F0",
} as const;

export function markSvg({ tile = true, size }: { tile?: boolean; size?: number } = {}) {
  const dims = size ? ` width="${size}" height="${size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"${dims}><defs><linearGradient id="g" x1="8" y1="8" x2="40" y2="42" gradientUnits="userSpaceOnUse"><stop stop-color="${brandHex.bolt400}"/><stop offset="1" stop-color="${brandHex.ember500}"/></linearGradient></defs>${
    tile ? `<rect width="48" height="48" rx="13" fill="${brandHex.ink}"/>` : ""
  }<path d="${MARK_W_PATH}" stroke="url(#g)" stroke-width="5.6" stroke-linejoin="miter" stroke-miterlimit="12"/><path d="${MARK_BOLT_PATH}" fill="${brandHex.bolt50}" stroke="${brandHex.ink}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
