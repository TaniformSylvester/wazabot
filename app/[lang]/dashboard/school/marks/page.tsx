import Link from "next/link";
import { ClipboardCheck, PenLine } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader, Panel, param, secondaryLink } from "@/components/app/ui";
import { FilterSelect } from "@/components/school/filter-select";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listClasses, listTerms, pickYear } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.school.marksHub.title);

/**
 * Where marks are entered: every class with its subjects for a term, each
 * with "Enter marks" (the subject's teacher, or an owner or admin). When marks
 * can't be entered yet, it says what's missing and links to it.
 */
export default async function MarksHubPage({ searchParams }: PageProps<"/[lang]/dashboard/school/marks">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { user, business } = await requireBusiness(localizePath(locale, "/dashboard/school/marks"));
  const d = t.dashboard;
  const m = d.school.marksHub;
  const href = (p: string) => localizePath(locale, p);
  const isAdmin = hasRole(business.role, "admin");
  const teacher = business.role === "teacher";

  const { year } = await pickYear(business.id);
  const [terms, classes] = year ? await Promise.all([listTerms(business.id, year.id), listClasses(business.id, year.id)]) : [[], []];
  const term = terms.find((x) => x.id === param(sp.term)) ?? terms[0] ?? null;

  const db = await createClient();
  const { data: rows } = classes.length
    ? await db
        .from("class_subjects")
        .select("id, class_id, teacher_id, position, school_subjects(name)")
        .eq("business_id", business.id)
        .in("class_id", classes.map((c) => c.id))
        .order("position")
    : { data: [] };
  const subjectsOf = (classId: string) => (rows ?? []).filter((r) => r.class_id === classId && (!teacher || r.teacher_id === user.id));
  const canMark = (teacherId: string | null) => isAdmin || teacherId === user.id;
  const shown = teacher ? classes.filter((c) => subjectsOf(c.id).length > 0) : classes;

  // What's missing before marks can be entered, with where to fix it.
  const blocker = !year
    ? { text: m.needYear, link: "/dashboard/school/settings#years", label: m.goSettings }
    : !terms.length
      ? { text: m.needTerm, link: "/dashboard/school/settings#years", label: m.goSettings }
      : !classes.length
        ? { text: m.needClasses, link: "/dashboard/school/classes", label: m.goClasses }
        : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          term ? (
            <Link href={href(`/dashboard/school/results?term=${term.id}`)} className={secondaryLink}>
              <ClipboardCheck aria-hidden /> {m.results}
            </Link>
          ) : null
        }
      />

      {blocker ? (
        <FormAlert tone="info">
          <span data-testid="marks-blocker">{blocker.text}</span>{" "}
          {!teacher ? (
            <Link href={href(blocker.link)} className="font-semibold underline">
              {blocker.label}
            </Link>
          ) : null}
        </FormAlert>
      ) : (
        <>
          {terms.length > 1 ? (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <FilterSelect name="term" label={m.term} defaultValue={term?.id ?? ""} options={terms.map((x) => ({ value: x.id, label: x.name }))} />
              <button type="submit" className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">
                {m.show}
              </button>
            </form>
          ) : null}
          {term && !term.assessments.length ? (
            <FormAlert tone="info">
              <span data-testid="marks-blocker">{format(m.needAssessments, { term: term.name })}</span>{" "}
              {!teacher ? (
                <Link href={href("/dashboard/school/settings#years")} className="font-semibold underline">
                  {m.goSettings}
                </Link>
              ) : null}
            </FormAlert>
          ) : null}
          {teacher ? <p className="text-sm text-slate">{shown.length ? m.mine : m.none}</p> : null}

          <ul className="grid gap-4 md:grid-cols-2" data-testid="marks-classes">
            {shown.map((c) => {
              const subjects = subjectsOf(c.id);
              return (
                <li key={c.id}>
                  <Panel title={c.name} description={format(m.students, { count: String(c.students) })}>
                    {!subjects.length ? (
                      <p className="text-sm text-slate">
                        {m.noSubjects}{" "}
                        {isAdmin ? (
                          <Link href={href(`/dashboard/school/classes/${c.id}`)} className="font-semibold text-waza-700 hover:underline">
                            {m.addSubjects}
                          </Link>
                        ) : null}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {subjects.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                            <span className="font-semibold text-deep">{s.school_subjects?.name}</span>
                            {term && term.assessments.length ? (
                              <Link
                                href={href(`/dashboard/school/classes/${c.id}/marks?subject=${s.id}&term=${term.id}`)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-waza-700 hover:bg-mint hover:underline"
                                data-testid="marks-enter"
                              >
                                <PenLine className="size-4" aria-hidden /> {canMark(s.teacher_id) ? m.enter : m.view}
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.students === 0 && isAdmin ? (
                      <p className="mt-2 text-xs text-slate">
                        {m.noStudents}{" "}
                        <Link href={href(`/dashboard/school/classes/${c.id}`)} className="font-semibold text-waza-700 hover:underline">
                          {m.addStudents}
                        </Link>
                      </p>
                    ) : null}
                  </Panel>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
