import Link from "next/link";
import { Backpack, Plus, Search } from "lucide-react";

import { PlanUpsell } from "@/components/app/plan-upsell";
import { EmptyState, PageHeader, Panel, StatusBadge, TableWrap, buttonLink, param, secondaryLink, td, th } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getEntitlements, limitInForce } from "@/lib/data/queries";
import { STUDENTS_PAGE_SIZE, listClasses, listStudents, pickYear } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.school.students.title);

/** Students: search, filter by class and status, register. */
export default async function StudentsPage({ searchParams }: PageProps<"/[lang]/dashboard/school/students">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/school/students"));
  const d = t.dashboard;
  const s = d.school.students;
  const { year } = await pickYear(business.id);
  const filters = { q: param(sp.q), classId: param(sp.class), status: param(sp.status), page: Number(param(sp.page) ?? 1) || 1 };
  const [classes, list, ent] = await Promise.all([year ? listClasses(business.id, year.id) : Promise.resolve([]), listStudents(business.id, filters), getEntitlements(business.id)]);
  const maxStudents = limitInForce(ent, ent?.maxStudents);
  const studentsFull = maxStudents !== null && (ent?.studentsUsed ?? 0) >= maxStudents;
  const href = (p: string) => localizePath(locale, p);
  const base = href("/dashboard/school/students");
  const yearClass = (r: (typeof list.rows)[number]) => r.school_enrollments.find((e) => e.year_id === year?.id)?.school_classes?.name ?? "—";
  const filtered = !!(filters.q || filters.classId || filters.status);
  const pages = Math.max(1, Math.ceil(list.total / STUDENTS_PAGE_SIZE));
  const qs = (page: number) => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.classId) p.set("class", filters.classId);
    if (filters.status) p.set("status", filters.status);
    p.set("page", String(page));
    return `${base}?${p}`;
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={s.title}
        description={s.description}
        actions={
          hasRole(business.role, "agent") && !studentsFull ? (
            <Link href={href("/dashboard/school/students/new")} className={buttonLink} data-testid="new-student">
              <Plus aria-hidden /> {s.new}
            </Link>
          ) : null
        }
      />
      {maxStudents !== null && ent && hasRole(business.role, "agent") ? (
        studentsFull ? (
          <PlanUpsell compact text={format(d.school.limits.studentsFull, { max: formatNumber(maxStudents, locale) })} cta={d.plan.upgrade} locale={locale} />
        ) : (
          <p className="text-sm text-slate" data-testid="students-usage">
            {format(d.school.limits.studentsUsed, { used: formatNumber(ent.studentsUsed, locale), max: formatNumber(maxStudents, locale) })}
          </p>
        )
      ) : null}
      <Panel>
        <form method="get" action={base} className="mb-4 flex flex-wrap gap-2" role="search">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">{s.search}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
            <input name="q" defaultValue={filters.q} placeholder={s.search} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
          </label>
          <select name="class" defaultValue={filters.classId ?? ""} aria-label={s.columns.class} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
            <option value="">{s.allClasses}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={filters.status ?? ""} aria-label={s.columns.status} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
            <option value="">{s.allStatuses}</option>
            {(["active", "withdrawn", "graduated"] as const).map((x) => (
              <option key={x} value={x}>
                {s.statuses[x]}
              </option>
            ))}
          </select>
          <button type="submit" className={secondaryLink}>
            {s.filter}
          </button>
        </form>
        {list.rows.length ? (
          <>
            <p className="mb-2 text-xs text-slate">{format(s.count, { count: list.total })}</p>
            <TableWrap>
              <thead>
                <tr>
                  {[s.columns.number, s.columns.name, s.columns.class, s.columns.guardian, s.columns.status].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody data-testid="student-rows">
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} font-mono text-xs`} data-label={s.columns.number}>
                      {r.student_number}
                    </td>
                    <td className={td} data-label={s.columns.name}>
                      <Link href={href(`/dashboard/school/students/${r.id}`)} className="font-semibold text-waza-700 hover:underline">
                        {r.last_name.toUpperCase()} {r.first_name}
                      </Link>
                    </td>
                    <td className={td} data-label={s.columns.class}>
                      {yearClass(r)}
                    </td>
                    <td className={`${td} text-slate`} data-label={s.columns.guardian}>
                      {r.guardian_name ?? "—"}
                    </td>
                    <td className={td} data-label={s.columns.status}>
                      <StatusBadge tone={r.status === "active" ? "green" : "neutral"}>{s.statuses[r.status as keyof typeof s.statuses] ?? r.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {pages > 1 ? (
              <div className="mt-4 flex justify-between text-sm">
                {list.page > 1 ? <Link href={qs(list.page - 1)} className="font-semibold text-waza-700">{d.documents.previous}</Link> : <span />}
                {list.page < pages ? <Link href={qs(list.page + 1)} className="font-semibold text-waza-700">{d.documents.next}</Link> : null}
              </div>
            ) : null}
          </>
        ) : filtered ? (
          <p className="text-sm text-slate">{s.noResults}</p>
        ) : (
          <EmptyState icon={Backpack} title={s.empty} text={s.description} />
        )}
      </Panel>
    </div>
  );
}
