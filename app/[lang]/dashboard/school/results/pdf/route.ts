import { NextResponse, type NextRequest } from "next/server";

import { isUuid } from "@/lib/actions/form";
import { getCurrentBusiness } from "@/lib/auth/dal";
import { bulkReportCardsAllowed, getEntitlements } from "@/lib/data/queries";
import { computeReportCards, getPublication } from "@/lib/data/school";
import { renderReportCardsPdf, reportCardFileName } from "@/lib/documents/pdf/render";
import { logoFromStorageUrl } from "@/lib/documents/server";
import { logServerError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Report cards as PDF: ?class=&term=[&student=][&inline=1]. Published results
 * print from their frozen snapshot; otherwise the current marks print as
 * "Provisional" (for the school's staff and the class's teachers — RLS decides
 * what they can read). Nothing is stored. A whole class in one PDF needs a
 * plan with bulk report cards; one student's always prints.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const classId = q.get("class") ?? "";
  const termId = q.get("term") ?? "";
  const studentId = q.get("student");
  const business = await getCurrentBusiness();
  if (!business || !isUuid(classId) || !isUuid(termId) || (studentId && !isUuid(studentId))) return new NextResponse("Not found", { status: 404 });
  if (!studentId && !bulkReportCardsAllowed(await getEntitlements(business.id))) {
    return new NextResponse("Report cards for a whole class need a bigger plan (Billing).", { status: 403 });
  }
  const pub = await getPublication(business.id, termId, classId);
  const data = pub?.data ?? (await computeReportCards(business, classId, termId));
  if (!data || (studentId && !data.students.some((s) => s.id === studentId))) return new NextResponse("Not found", { status: 404 });
  try {
    const pdf = await renderReportCardsPdf(data, { studentIds: studentId ? [studentId] : undefined, logo: await logoFromStorageUrl(business.logoUrl), branding: false });
    const student = studentId ? data.students.find((s) => s.id === studentId) : undefined;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${q.get("inline") === "1" ? "inline" : "attachment"}; filename="${reportCardFileName(data, student)}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    logServerError("school.reportCards.pdf", e);
    return new NextResponse("PDF failed", { status: 500 });
  }
}
