import Link from "next/link";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { FilterSelect } from "@/components/school/filter-select";
import { PageHeader, Panel, TableWrap, param, td, th } from "@/components/app/ui";
import { createClass, createSubject } from "@/lib/actions/school";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listClasses, listSubjects, listTeachers, pickYear } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.school.classes.title);

/** Classes of a year (teachers: theirs), adding classes, and the school's subjects. */
export default async function ClassesPage({ searchParams }: PageProps<"/[lang]/dashboard/school/classes">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/school/classes"));
  const d = t.dashboard;
  const c = d.school.classes;
  const isAdmin = hasRole(business.role, "admin");
  const { years, year } = await pickYear(business.id, param(sp.year));
  const [classes, subjects, teachers] = await Promise.all([
    year ? listClasses(business.id, year.id) : Promise.resolve([]),
    listSubjects(business.id),
    isAdmin ? listTeachers(business.id) : Promise.resolve([]),
  ]);
  const href = (p: string) => localizePath(locale, p);
  const text = { errors: d.errors, saved: d.common.saved, saving: d.common.saving };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={c.title} description={business.role === "teacher" ? c.teacherOnly : c.description} />
      {!year ? (
        <FormAlert tone="info">
          {d.school.overview.noYear}{" "}
          {isAdmin ? (
            <Link href={href("/dashboard/school/settings#years")} className="font-semibold underline">
              {d.school.overview.settings}
            </Link>
          ) : null}
        </FormAlert>
      ) : null}
      {years.length > 1 ? (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <FilterSelect name="year" label={c.year} defaultValue={year?.id ?? ""} options={years.map((y) => ({ value: y.id, label: y.name }))} />
          <button type="submit" className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">
            {d.school.results.show}
          </button>
        </form>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title={year ? `${c.title} · ${year.name}` : c.title}>
          {classes.length ? (
            <TableWrap>
              <thead>
                <tr>
                  {[c.columns.name, c.columns.level, c.columns.classTeacher, c.columns.students, c.columns.subjects].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody data-testid="class-rows">
                {classes.map((k) => (
                  <tr key={k.id}>
                    <td className={td} data-label={c.columns.name}>
                      <Link href={href(`/dashboard/school/classes/${k.id}`)} className="font-semibold text-waza-700 hover:underline">
                        {k.name}
                      </Link>
                    </td>
                    <td className={`${td} text-slate`} data-label={c.columns.level}>
                      {k.level ?? "—"}
                    </td>
                    <td className={td} data-label={c.columns.classTeacher}>
                      {k.classTeacher ?? c.noTeacher}
                    </td>
                    <td className={td} data-label={c.columns.students}>
                      {k.students}
                    </td>
                    <td className={td} data-label={c.columns.subjects}>
                      {k.subjects}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-slate">{c.empty}</p>
          )}
          {isAdmin && year ? (
            <ActionForm action={createClass.bind(null, year.id)} text={{ ...text, saved: c.created }} successMessage={c.created} resetOnSuccess className="mt-5 border-t border-border pt-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField name="name" label={c.name} maxLength={60} required />
                <TextField name="level" label={c.level} maxLength={40} />
                <SelectField name="class_teacher_id" label={c.classTeacher} defaultValue="" options={[{ value: "", label: c.noTeacher }, ...teachers.map((x) => ({ value: x.id, label: x.name }))]} />
              </div>
              <div>
                <SubmitButton>{c.create}</SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </Panel>

        {business.role !== "teacher" ? (
          <Panel id="subjects" title={c.subjectsTitle} description={c.subjectsText} className="h-fit">
            {subjects.length ? (
              <ul className="mb-4 flex flex-wrap gap-2" data-testid="subject-list">
                {subjects.map((x) => (
                  <li key={x.id} className="rounded-full bg-surface px-3 py-1 text-sm text-deep">
                    {x.name}
                    {x.code ? <span className="ml-1 text-xs text-slate">{x.code}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-slate">{c.noSubjects}</p>
            )}
            {isAdmin ? (
              <ActionForm action={createSubject} text={{ ...text, saved: c.subjectAdded }} successMessage={c.subjectAdded} resetOnSuccess>
                <TextField name="name" label={c.subjectName} maxLength={80} required />
                <TextField name="code" label={c.code} maxLength={12} />
                <div>
                  <SubmitButton variant="outline">{c.addSubject}</SubmitButton>
                </div>
              </ActionForm>
            ) : null}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
