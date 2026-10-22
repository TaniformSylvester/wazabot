import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { PageHeader, Panel, StatusBadge, TableWrap, formatMoney, formatPercent, param, secondaryLink, td, th } from "@/components/app/ui";
import { FilterSelect } from "@/components/school/filter-select";
import { cheapestPlanWith } from "@/config/plans";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getEntitlements, schoolReportsAllowed } from "@/lib/data/queries";
import { getSchoolReport, getSchoolSettings, listTerms, pickYear } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { formatScore } from "@/lib/school/report-card";

export const generateMetadata = dashboardMetadata((d) => d.school.reports.title);

/** Advanced school reports (Business and Pro): class and subject results for a term, fee collection per class, CSV. Owners and admins. */
export default async function SchoolReportsPage({ searchParams }: PageProps<"/[lang]/dashboard/school/reports">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/school/reports"));
  if (!hasRole(business.role, "admin")) redirect(localizePath(locale, "/dashboard/school"));
  const d = t.dashboard;
  const r = d.school.reports;
  const c = r.columns;

  if (!schoolReportsAllowed(await getEntitlements(business.id))) {
    const plan = cheapestPlanWith((p) => p.hasSchoolReports);
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader title={r.title} description={r.description} />
        <PlanUpsell
          title={d.school.limits.reportsLocked.title}
          text={format(d.school.limits.reportsLocked.text, {
            plan: plan ? t.pricing.plans[plan.id].name : "",
          })}
          cta={d.plan.upgrade}
          locale={locale}
        />
      </div>
    );
  }

  const { year } = await pickYear(business.id);
  const terms = year ? await listTerms(business.id, year.id) : [];
  const term = terms.find((x) => x.id === param(sp.term)) ?? terms[0] ?? null;
  const [report, settings] = year && term ? await Promise.all([getSchoolReport(business, year.id, term.id), getSchoolSettings(business.id)]) : [null, null];
  const n = (v: number | null) => formatScore(v, settings?.decimals ?? 2, locale);
  const pct = (v: number | null) => (v === null ? "—" : formatPercent(v, locale));
  const money = (v: number) => formatMoney(v, business.currency, locale);
  const csv = (kind: string) => localizePath(locale, `/dashboard/school/reports/export?term=${term?.id}&kind=${kind}`);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={r.title} description={r.description} />
      {!year || !term || !report ? (
        <FormAlert tone="info">{r.noTerm}</FormAlert>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <FilterSelect name="term" label={r.term} defaultValue={term.id} options={terms.map((x) => ({ value: x.id, label: x.name }))} />
            <button type="submit" className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">
              {r.show}
            </button>
          </form>

          <Panel
            title={`${r.classesTitle} · ${term.name}`}
            actions={
              <a href={csv("classes")} className={secondaryLink} data-testid="school-report-csv">
                <Download aria-hidden /> {r.export}
              </a>
            }
          >
            {report.classes.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    {[c.class, c.students, c.status, c.average, c.highest, c.lowest, c.passRate, c.billed, c.paid, c.outstanding, c.collection].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="school-report-classes">
                  {report.classes.map((row) => (
                    <tr key={row.classId}>
                      <td className={`${td} font-semibold`} data-label={c.class}>
                        {row.className}
                      </td>
                      <td className={td} data-label={c.students}>
                        {row.students}
                      </td>
                      <td className={td} data-label={c.status}>
                        <StatusBadge tone={row.published ? "green" : "neutral"}>{row.published ? r.published : r.provisional}</StatusBadge>
                      </td>
                      <td className={`${td} font-semibold`} data-label={c.average}>
                        {n(row.average)}
                      </td>
                      <td className={td} data-label={c.highest}>
                        {n(row.highest)}
                      </td>
                      <td className={td} data-label={c.lowest}>
                        {n(row.lowest)}
                      </td>
                      <td className={td} data-label={c.passRate}>
                        {pct(row.passRate)}
                      </td>
                      <td className={`${td} whitespace-nowrap`} data-label={c.billed}>
                        {money(row.billed)}
                      </td>
                      <td className={`${td} whitespace-nowrap`} data-label={c.paid}>
                        {money(row.paid)}
                      </td>
                      <td className={`${td} whitespace-nowrap`} data-label={c.outstanding}>
                        {money(row.outstanding)}
                      </td>
                      <td className={td} data-label={c.collection}>
                        {pct(row.collectionRate)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-surface font-semibold">
                    <td className={td} data-label={c.class}>
                      {r.totals}
                    </td>
                    <td className={td} data-label={c.students}>
                      {report.totals.students}
                    </td>
                    <td className={td} />
                    <td className={td} data-label={c.average}>
                      {n(report.totals.average)}
                    </td>
                    <td className={td} />
                    <td className={td} />
                    <td className={td} data-label={c.passRate}>
                      {pct(report.totals.passRate)}
                    </td>
                    <td className={`${td} whitespace-nowrap`} data-label={c.billed}>
                      {money(report.totals.billed)}
                    </td>
                    <td className={`${td} whitespace-nowrap`} data-label={c.paid}>
                      {money(report.totals.paid)}
                    </td>
                    <td className={`${td} whitespace-nowrap`} data-label={c.outstanding}>
                      {money(report.totals.outstanding)}
                    </td>
                    <td className={td} data-label={c.collection}>
                      {pct(report.totals.collectionRate)}
                    </td>
                  </tr>
                </tbody>
              </TableWrap>
            ) : (
              <p className="text-sm text-slate">{r.empty}</p>
            )}
          </Panel>

          {report.subjects.length ? (
            <Panel
              title={`${r.subjectsTitle} · ${term.name}`}
              actions={
                <a href={csv("subjects")} className={secondaryLink}>
                  <Download aria-hidden /> {r.export}
                </a>
              }
            >
              <TableWrap>
                <thead>
                  <tr>
                    {[c.class, c.subject, c.coefficient, c.teacher, c.average, c.highest, c.lowest, c.passRate].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="school-report-subjects">
                  {report.subjects.map((row, i) => (
                    <tr key={`${row.classId}-${i}`}>
                      <td className={td} data-label={c.class}>
                        {row.className}
                      </td>
                      <td className={`${td} font-semibold`} data-label={c.subject}>
                        {row.subject}
                      </td>
                      <td className={td} data-label={c.coefficient}>
                        {row.coefficient}
                      </td>
                      <td className={td} data-label={c.teacher}>
                        {row.teacher ?? "—"}
                      </td>
                      <td className={`${td} font-semibold`} data-label={c.average}>
                        {n(row.average)}
                      </td>
                      <td className={td} data-label={c.highest}>
                        {n(row.highest)}
                      </td>
                      <td className={td} data-label={c.lowest}>
                        {n(row.lowest)}
                      </td>
                      <td className={td} data-label={c.passRate}>
                        {pct(row.passRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
