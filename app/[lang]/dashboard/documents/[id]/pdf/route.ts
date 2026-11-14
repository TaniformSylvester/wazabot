import { NextResponse, type NextRequest } from "next/server";

import { isUuid } from "@/lib/actions/form";
import { EVERYONE, requireRole, roleErrorResponse } from "@/lib/auth/requireRole";
import { getDocument, rowToDocument } from "@/lib/data/documents";
import { pdfFileName, renderDocumentPdf } from "@/lib/documents/pdf/render";
import { logoFromStorageUrl } from "@/lib/documents/server";
import { logServerError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * A business document as PDF, rendered on demand from its saved snapshot for a
 * member of the business (the session and RLS decide; nothing is stored).
 * ?inline=1 opens it in the browser (to print) instead of downloading.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Any member of the business may read its documents (401 signed out, 403 not a member); queries below are scoped to this business.
  const check = await requireRole(EVERYONE, { access: "read", readOnlyOk: true });
  if (!check.ok) return roleErrorResponse(check);
  const business = check.ctx.business;
  if (!business) return new NextResponse("Not found", { status: 404 });
  const row = isUuid(id) ? await getDocument(business.id, id) : null;
  if (!row) return new NextResponse("Not found", { status: 404 });
  const doc = rowToDocument(row);
  try {
    const pdf = await renderDocumentPdf(doc, { logo: await logoFromStorageUrl(business.logoUrl), branding: false });
    const inline = request.nextUrl.searchParams.get("inline") === "1";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${pdfFileName(doc)}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    logServerError("documents.pdf", e);
    return new NextResponse("PDF failed", { status: 500 });
  }
}
