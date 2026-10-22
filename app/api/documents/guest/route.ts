import { NextResponse, type NextRequest } from "next/server";

import { renderDocumentPdf, pdfFileName } from "@/lib/documents/pdf/render";
import { documentSchema, GUEST_MAX_ITEMS } from "@/lib/documents/schema";
import { guestAllowed, guestKey, logoFromDataUrl } from "@/lib/documents/server";
import type { DocumentData } from "@/lib/documents/types";
import { logServerError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

/** JSON body (document + optional logo as a data URL) is capped well under Vercel's 4.5 MB. */
const MAX_BODY = 1_600_000;

const fail = (status: number, error: string, issues?: { path: string; message: string }[]) =>
  NextResponse.json({ error, ...(issues ? { issues } : {}) }, { status, headers: { "cache-control": "no-store" } });

/**
 * Guest document generator: validates the document, renders the PDF and sends
 * it back. Nothing is saved; the logo is re-encoded in memory and discarded.
 * Rate-limited per (hashed) IP address.
 */
export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return fail(413, "too_large");
  let body: { document?: unknown; logo?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return fail(413, "too_large");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "invalid");
  }

  const parsed = documentSchema(GUEST_MAX_ITEMS).safeParse(body?.document);
  if (!parsed.success) {
    return fail(422, "invalid", parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const logo = await logoFromDataUrl(body.logo);
  if (logo === "invalid") return fail(422, "logo_invalid");

  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await guestAllowed(guestKey(ip)))) return fail(429, "rate_limited");

  const doc: DocumentData = { ...parsed.data, stamp: null, payment: parsed.data.type === "receipt" ? parsed.data.payment : null };
  try {
    const pdf = await renderDocumentPdf(doc, { logo, branding: true });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${pdfFileName(doc)}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    logServerError("documents.guestPdf", e);
    return fail(500, "failed");
  }
}
