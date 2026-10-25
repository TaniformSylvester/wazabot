import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader, Panel, StatusBadge, TableWrap, td, th } from "@/components/app/ui";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { getFairUseReport } from "@/lib/admin/fair-use";
import { pendingPlanRequestCount } from "@/lib/admin/plan-requests";
import { getLocale } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = { title: "Fair use", robots: { index: false, follow: false } };

const num = new Intl.NumberFormat("en-GB");

/**
 * WazaBolt team only: schools on plans without a student limit (Pro), largest
 * first, so fair use can be reviewed by hand. Counts only, nothing about the
 * students themselves.
 */
export default async function FairUseAdminPage() {
  const locale = await getLocale();
  const admin = await requirePlatformAdmin(locale, "/admin/fair-use");
  const [report, waiting] = await Promise.all([getFairUseReport(admin), pendingPlanRequestCount(admin)]);
  const ref = report.reference;
  const above = report.schools.filter((s) => s.aboveReference).length;

  return (
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6">
      <AdminNav locale={locale} active="fair-use" pendingPlanRequests={waiting} />
      <PageHeader
        title="Fair use — unlimited schools"
        description={`Schools on ${report.unlimitedPlans.join(", ") || "no plan"} have no student or report-card limit. There's no automatic cap: review the largest by hand.${ref ? ` Flagged: more active students than the ${ref.planId} plan allows (${num.format(ref.maxStudents)}).` : ""}`}
      />

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Schools on unlimited plans", value: report.schools.length },
          { label: ref ? `Above ${num.format(ref.maxStudents)} students` : "Flagged", value: above },
          { label: "Active students (all)", value: report.schools.reduce((n, s) => n + s.activeStudents, 0) },
        ].map((s) => (
          <li key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold text-slate">{s.label}</p>
            <p className="font-display text-2xl font-bold text-deep">{num.format(s.value)}</p>
          </li>
        ))}
      </ul>

      <Panel id="schools" title="Schools, largest first">
        {report.schools.length ? (
          <TableWrap>
            <thead>
              <tr>
                {["School", "Plan", "Active students", "Classes", "Teachers", "Documents", "Review"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.schools.map((s) => (
                <tr key={s.id} data-business-id={s.id}>
                  <td className={`${td} font-semibold`}>{s.name}</td>
                  <td className={td}>{s.planId}</td>
                  <td className={td}>{num.format(s.activeStudents)}</td>
                  <td className={td}>{num.format(s.classes)}</td>
                  <td className={td}>{num.format(s.teachers)}</td>
                  <td className={td}>{num.format(s.documents)}</td>
                  <td className={td}>{s.aboveReference ? <StatusBadge tone="amber">Above {ref?.planId}</StatusBadge> : <StatusBadge tone="neutral">Normal</StatusBadge>}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-slate">No school is on an unlimited plan yet.</p>
        )}
      </Panel>
    </main>
  );
}
