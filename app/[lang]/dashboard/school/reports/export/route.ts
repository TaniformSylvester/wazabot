import { isUuid } from "@/lib/actions/form";
import { authorize } from "@/lib/auth/dal";
import { getEntitlements, schoolReportsAllowed } from "@/lib/data/queries";
import { getSchoolReport, listTerms, pickYear } from "@/lib/data/school";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/load";
import { toCsv, type Cell } from "@/lib/reports/csv";

/** CSV of the advanced school report for a term (owners and admins on a plan with school reports): ?term=&kind=classes|subjects. */
export async function GET(request: Request, ctx: RouteContext<"/[lang]/dashboard/school/reports/export">) {
  const { lang } = await ctx.params;
  if (!isLocale(lang)) return new Response("Not found", { status: 404 });
  const auth = await authorize("admin");
  if (!auth) return new Response("Forbidden", { status: 403 });
  const { business } = auth;
  if (!schoolReportsAllowed(await getEntitlements(business.id)))
    return new Response("School reports need a bigger plan (Billing).", {
      status: 403,
    });
  const url = new URL(request.url);
  const termId = url.searchParams.get("term") ?? "";
  const kind = url.searchParams.get("kind") === "subjects" ? "subjects" : "classes";
  const { year } = await pickYear(business.id);
  const term = year && isUuid(termId) ? (await listTerms(business.id, year.id)).find((x) => x.id === termId) : undefined;
  if (!year || !term) return new Response("Not found", { status: 404 });

  const report = await getSchoolReport(business, year.id, term.id);
  const r = (await getDictionary(lang)).dashboard.school.reports;
  const c = r.columns;
  const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);
  let header: string[];
  let rows: Cell[][];
  if (kind === "classes") {
    header = [c.class, c.students, c.status, c.average, c.highest, c.lowest, `${c.passRate} (%)`, c.billed, c.paid, c.outstanding, `${c.collection} (%)`];
    rows = report.classes.map((x) => [
      x.className,
      x.students,
      x.published ? r.published : r.provisional,
      x.average,
      x.highest,
      x.lowest,
      pct(x.passRate),
      x.billed,
      x.paid,
      x.outstanding,
      pct(x.collectionRate),
    ]);
    const t = report.totals;
    rows.push([r.totals, t.students, null, t.average, null, null, pct(t.passRate), t.billed, t.paid, t.outstanding, pct(t.collectionRate)]);
  } else {
    header = [c.class, c.subject, c.coefficient, c.teacher, c.average, c.highest, c.lowest, `${c.passRate} (%)`];
    rows = report.subjects.map((x) => [x.className, x.subject, x.coefficient, x.teacher, x.average, x.highest, x.lowest, pct(x.passRate)]);
  }

  const slug = (v: string) =>
    v
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  const name = `${slug(business.name) || "wazabolt"}-${kind}-${slug(term.name) || "term"}.csv`;
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
