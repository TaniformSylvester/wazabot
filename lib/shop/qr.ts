import { encode } from "uqr";

/**
 * A QR code as a small SVG: one path, with the 4-module quiet zone scanners
 * need. Error correction Q (25%) so a creased, dirty or partly covered print
 * still scans.
 */
export function qrSvg(text: string, { color = "#102A2A", background = "#FFFFFF", size }: { color?: string; background?: string; size?: number } = {}): string {
  const { data, size: n } = encode(text, { ecc: "Q", border: 0 });
  const quiet = 4;
  const total = n + quiet * 2;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!data[y][x]) continue;
      // Runs of dark modules on a row become one rectangle.
      let run = 1;
      while (x + run < n && data[y][x + run]) run++;
      d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  const dims = size ? ` width="${size}" height="${size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dims} shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${background}"/><path d="${d}" fill="${color}"/></svg>`;
}
