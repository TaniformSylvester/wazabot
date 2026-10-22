import { NextResponse, type NextRequest } from "next/server";

import { isUuid } from "@/lib/actions/form";
import { getCurrentBusiness } from "@/lib/auth/dal";
import { customerStatement } from "@/lib/data/statements";
import { renderStatementPdf, statementFileName } from "@/lib/documents/pdf/render";
import { logoFromStorageUrl } from "@/lib/documents/server";
import { logServerError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * A customer's statement of account as PDF (?from=&to=&lang=), for a member
 * of the business (the session and RLS decide; nothing is stored).
 * ?inline=1 opens it in the browser (to print) instead of downloading.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const business = await getCurrentBusiness();
  if (!business || !isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const q = request.nextUrl.searchParams;
  const st = await customerStatement(business, id, { from: q.get("from"), to: q.get("to"), language: q.get("lang") });
  if (!st) return new NextResponse("Not found", { status: 404 });
  try {
    const pdf = await renderStatementPdf(st, { logo: await logoFromStorageUrl(business.logoUrl), branding: false });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${q.get("inline") === "1" ? "inline" : "attachment"}; filename="${statementFileName(st)}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    logServerError("statements.pdf", e);
    return new NextResponse("PDF failed", { status: 500 });
  }
}
