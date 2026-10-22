import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, PenLine } from "lucide-react";

import { ActionButton, ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { FilterSelect } from "@/components/school/filter-select";
import { PageHeader, Panel, TableWrap, param, secondaryLink, td, th } from "@/components/app/ui";
import { addClassSubject, enrolStudent, removeClassSubject, unenrolStudent, updateClass, updateClassSubject } from "@/lib/actions/school";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getClass, listSubjects, listTeachers, listTerms } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.school.classes.title);

/** One class: details, subjects (coefficient, teacher), students, and marks entry per subject for a term. */
export default async function ClassPage({ params, searchParams }: PageProps<"/[lang]/dashboard/school/classes/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { user, business } = await requireBusiness(localizePath(locale, `/dashboard/school/classes/${id}`));
  const klass = isUuid(id) ? await getClass(business.id, id) : null;
  if (!klass) notFound();
  const d = t.dashboard;
  const c = d.school.class;
  const cl = d.school.classes;
  const isAdmin = hasRole(business.role, "admin");
  const isStaff = hasRole(business.role, "agent");
  const href = (p: string) => localizePath(locale, p);
  const text = { errors: d.errors, saved: d.common.saved, saving: d.common.saving };
  const [terms, subjects, teachers] = await Promise.all([
    listTerms(business.id, klass.yearId),
    isAdmin ? listSubjects(business.id) : Promise.resolve([]),
    isAdmin ? listTeachers(business.id) : Promise.resolve([]),
  ]);
  const term = terms.find((x) => x.id === param(sp.term)) ?? terms[0] ?? null;
  const teacherOptions = [{ value: "", label: cl.noTeacher }, ...teachers.map((x) => ({ value: x.id, label: x.name }))];
  const free = subjects.filter((s) => !klass.subjects.some((cs) => cs.subjectId === s.id));
  const canMark = (teacherId: string | null) => isAdmin || teacherId === user.id;

  // Students who could join: active, not in a class this year.
  let candidates: { id: string; label: string }[] = [];
  if (isStaff) {
    const db = await createClient();
    const [{ data: all }, { data: taken }] = await Promise.all([
      db.from("school_students").select("id, student_number, first_name, last_name").eq("business_id", business.id).eq("status", "active").order("last_name").limit(2000),
      db.from("school_enrollments").select("student_id").eq("business_id", business.id).eq("year_id", klass.yearId),
    ]);
    const busy = new Set((taken ?? []).map((r) => r.student_id));
    candidates = (all ?? []).filter((s) => !busy.has(s.id)).map((s) => ({ id: s.id, label: `${s.last_name.toUpperCase()} ${s.first_name} · ${s.student_number}` }));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={klass.name}
        description={[klass.yearName, klass.level, klass.classTeacher ? `${cl.classTeacher} : ${klass.classTeacher}` : null].filter(Boolean).join(" · ")}
        back={{ href: href("/dashboard/school/classes"), label: cl.title }}
        actions={
          term ? (
            <Link href={href(`/dashboard/school/results?class=${klass.id}&term=${term.id}`)} className={secondaryLink}>
              <ClipboardCheck aria-hidden /> {c.results}
            </Link>
          ) : null
        }
      />

      {terms.length > 1 ? (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <FilterSelect name="term" label={c.term} defaultValue={term?.id ?? ""} options={terms.map((x) => ({ value: x.id, label: x.name }))} />
          <button type="submit" className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">
            {d.school.results.show}
          </button>
        </form>
      ) : null}

      <Panel title={c.subjects}>
        {klass.subjects.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>{c.subject}</th>
                <th className={`${th} text-right`}>{c.coefficient}</th>
                <th className={th}>{c.teacher}</th>
                <th className={th}>{c.marks}</th>
              </tr>
            </thead>
            <tbody data-testid="class-subjects">
              {klass.subjects.map((s) => (
                <tr key={s.id}>
                  <td className={`${td} font-semibold`} data-label={c.subject}>
                    {s.name}
                  </td>
                  {isAdmin ? (
                    <td className={td} colSpan={2} data-label={c.teacher}>
                      <ActionForm action={updateClassSubject.bind(null, s.id)} text={text} successMessage={d.common.saved}>
                        <div className="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-end">
                          <TextField name="coefficient" label={c.coefficient} defaultValue={String(s.coefficient)} inputMode="decimal" required />
                          <SelectField name="teacher_id" label={c.teacher} defaultValue={s.teacherId ?? ""} options={teacherOptions} />
                          <SubmitButton variant="outline">{d.common.save}</SubmitButton>
                        </div>
                      </ActionForm>
                    </td>
                  ) : (
                    <>
                      <td className={`${td} text-right`} data-label={c.coefficient}>
                        {s.coefficient}
                      </td>
                      <td className={td} data-label={c.teacher}>
                        {s.teacher ?? cl.noTeacher}
                      </td>
                    </>
                  )}
                  <td className={td} data-label={c.marks}>
                    <div className="flex flex-wrap items-center gap-2">
                      {term ? (
                        <Link href={href(`/dashboard/school/classes/${klass.id}/marks?subject=${s.id}&term=${term.id}`)} className="inline-flex items-center gap-1 font-semibold text-waza-700 hover:underline" data-testid="marks-link">
                          <PenLine className="size-4" aria-hidden /> {canMark(s.teacherId) ? c.enterMarks : c.marks}
                        </Link>
                      ) : null}
                      {isAdmin ? (
                        <ActionButton action={removeClassSubject.bind(null, s.id)} errors={d.errors} variant="ghost" confirm={`${c.remove} ${s.name} ?`}>
                          {c.remove}
                        </ActionButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-slate">{c.noSubjects}</p>
        )}
        {isAdmin && free.length ? (
          <ActionForm action={addClassSubject.bind(null, klass.id)} text={{ ...text, saved: c.added }} successMessage={c.added} resetOnSuccess className="mt-5 border-t border-border pt-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end">
              <SelectField name="subject_id" label={c.subject} defaultValue="" placeholder="—" options={free.map((s) => ({ value: s.id, label: s.name }))} required />
              <TextField name="coefficient" label={c.coefficient} defaultValue="1" inputMode="decimal" required />
              <SelectField name="teacher_id" label={c.teacher} defaultValue="" options={teacherOptions} />
              <SubmitButton variant="outline">{c.add}</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title={`${c.students} (${klass.students.filter((s) => s.enrollment === "enrolled").length})`}>
          {klass.students.length ? (
            <ul className="divide-y divide-border" data-testid="class-students">
              {klass.students.map((s) => (
                <li key={s.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm ${s.enrollment === "left" ? "text-slate line-through" : ""}`}>
                  <span className="font-mono text-xs text-slate">{s.student_number}</span>
                  {isStaff ? (
                    <Link href={href(`/dashboard/school/students/${s.id}`)} className="font-semibold text-deep hover:underline">
                      {s.last_name.toUpperCase()} {s.first_name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-deep">
                      {s.last_name.toUpperCase()} {s.first_name}
                    </span>
                  )}
                  {isStaff && s.enrollment === "enrolled" ? (
                    <span className="ml-auto">
                      <ActionButton action={unenrolStudent.bind(null, s.enrollmentId)} errors={d.errors} variant="ghost" confirm={`${c.unenrol} ?`}>
                        {c.unenrol}
                      </ActionButton>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">{c.noStudents}</p>
          )}
          {isStaff && candidates.length ? (
            <ActionForm action={enrolStudent.bind(null, klass.id)} text={{ ...text, saved: c.enrolled }} successMessage={c.enrolled} resetOnSuccess className="mt-5 border-t border-border pt-5">
              <p className="font-semibold text-deep">{c.enrol}</p>
              <SelectField name="student_id" label={c.chooseStudent} defaultValue="" placeholder="—" options={candidates.map((s) => ({ value: s.id, label: s.label }))} required />
              <p className="text-xs text-slate">{c.enrolHint}</p>
              <div>
                <SubmitButton variant="outline">{c.enrol}</SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </Panel>

        {isAdmin ? (
          <Panel title={c.update} className="h-fit">
            <ActionForm action={updateClass.bind(null, klass.id)} text={{ ...text, saved: c.saved }} successMessage={c.saved}>
              <TextField name="name" label={cl.name} defaultValue={klass.name} maxLength={60} required />
              <TextField name="level" label={cl.level} defaultValue={klass.level ?? ""} maxLength={40} />
              <SelectField name="class_teacher_id" label={cl.classTeacher} defaultValue={klass.classTeacherId ?? ""} options={teacherOptions} />
              <div>
                <SubmitButton variant="outline">{d.common.save}</SubmitButton>
              </div>
            </ActionForm>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
