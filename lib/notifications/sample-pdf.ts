/*
 * A one-page sample PDF ("Sample invoice"), the example file Meta asks for
 * when a template has a document header. Built by hand so the review doesn't
 * depend on a business's data; byte offsets are computed, so the file is valid.
 */

function buildPdf(lines: string[]): Buffer {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 22 : 12} Tf 60 ${760 - i * 28} Td (${l.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export const SAMPLE_PDF: Buffer = buildPdf(["Sample invoice", "INV-2026-000041", "Awa Styles, Douala", "Wax dress x 2: 30,000 FCFA", "Total: 30,000 FCFA", "Made with WazaBolt"]);
