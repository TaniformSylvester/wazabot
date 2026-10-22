import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { FilterSelect } from "@/components/school/filter-select";
import { PageHeader, Panel, param } from "@/components/app/ui";
import { MarksGrid } from "@/components/school/marks-grid";
import { saveSubjectMarks } from "@/lib/actions/school";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getClass, getPublication, getSchoolSettings, gradingSettings, listTerms, marksFor } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.school.class.marks);

/** Marks entry for one subject of a class, for one term (the subject's teacher or an admin). */
export default async function MarksPage({ params, searchParams }: PageProps<"/[lang]/dashboard/school/classes/[id]/marks">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { user, business } = await requireBusiness(localizePath(locale, `/dashboard/school/classes/${id}/marks`));
  const klass = isUuid(id) ? await getClass(business.id, id) : null;
  const subject = klass?.subjects.find((s) => s.id === param(sp.subject));
  if (!klass || !subject) notFound();
  const d = t.dashboard;
  const m = d.school.marks;
  const terms = await listTerms(business.id, klass.yearId);
  const term = terms.find((x) => x.id === param(sp.term)) ?? terms[0];
  if (!term) notFound();
  const [settings, marks, publication] = await Promise.all([getSchoolSettings(business.id), marksFor(business.id, [subject.id]), getPublication(business.id, term.id, klass.id)]);
  const db = await createClient();
  const { data: comments } = await db.from("school_subject_comments").select("student_id, comment").eq("business_id", business.id).eq("term_id", term.id).eq("class_subject_id", subject.id);
  const canMark = hasRole(business.role, "admin") || subject.teacherId === user.id;
  const ids = new Set(term.assessments.map((a) => a.id));
  const students = klass.students
    .filter((s) => s.enrollment === "enrolled")
    .map((s) => ({
      studentId: s.id,
      number: s.student_number,
      name: `${s.last_name.toUpperCase()} ${s.first_name}`,
      marks: Object.fromEntries(
        marks.filter((x) => x.student_id === s.id && ids.has(x.assessment_id)).map((x) => [x.assessment_id, x.absent ? "abs" : x.mark === null ? "" : String(Number(x.mark))]),
      ),
      comment: comments?.find((c) => c.student_id === s.id)?.comment ?? "",
    }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={format(m.title, { subject: subject.name })}
        description={format(m.description, { class: klass.name, term: term.name })}
        back={{ href: localizePath(locale, `/dashboard/school/classes/${klass.id}?term=${term.id}`), label: klass.name }}
      />
      {terms.length > 1 ? (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="subject" value={subject.id} />
          <FilterSelect name="term" label={d.school.class.term} defaultValue={term.id} options={terms.map((x) => ({ value: x.id, label: x.name }))} />
          <button type="submit" className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">
            {d.school.results.show}
          </button>
        </form>
      ) : null}
      {publication ? <FormAlert tone="info">{m.locked}</FormAlert> : !canMark ? <FormAlert tone="info">{m.readOnly}</FormAlert> : null}
      <Panel>
        {term.assessments.length ? (
          students.length ? (
            <MarksGrid
              assessments={term.assessments}
              students={students}
              settings={{ scaleMax: settings.scale_max, missingMarks: settings.missing_marks, decimals: gradingSettings(settings).decimals }}
              readOnly={!canMark || !!publication}
              save={saveSubjectMarks.bind(null, subject.id, term.id)}
              t={{ student: m.student, absent: m.absent, comment: m.comment, average: m.average, save: m.save, saved: m.saved, saving: d.common.saving, outOf: m.outOf, invalid: t.auth.validation.mark_out_of_range }}
              errors={d.errors}
            />
          ) : (
            <p className="text-sm text-slate">{d.school.class.noStudents}</p>
          )
        ) : (
          <p className="text-sm text-slate">{m.noAssessments}</p>
        )}
      </Panel>
    </div>
  );
}
