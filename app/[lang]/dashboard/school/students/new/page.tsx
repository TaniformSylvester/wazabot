import { redirect } from "next/navigation";

import { PlanUpsell } from "@/components/app/plan-upsell";
import { PageHeader, Panel, param } from "@/components/app/ui";
import { StudentForm } from "@/components/school/student-form";
import { saveStudent } from "@/lib/actions/school";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getEntitlements, limitInForce } from "@/lib/data/queries";
import { listClasses, pickYear } from "@/lib/data/school";
import { format, formatNumber } from "@/lib/i18n/format";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.school.students.new);

export default async function NewStudentPage({ searchParams }: PageProps<"/[lang]/dashboard/school/students/new">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/school/students/new"));
  if (!hasRole(business.role, "agent")) redirect(localizePath(locale, "/dashboard/school/students"));
  const d = t.dashboard;
  const s = d.school.students;
  const { year } = await pickYear(business.id);
  const [classes, ent] = await Promise.all([year ? listClasses(business.id, year.id) : Promise.resolve([]), getEntitlements(business.id)]);
  const maxStudents = limitInForce(ent, ent?.maxStudents);
  const full = maxStudents !== null && (ent?.studentsUsed ?? 0) >= maxStudents;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={s.new} back={{ href: localizePath(locale, "/dashboard/school/students"), label: s.title }} />
      {full ? (
        <PlanUpsell text={format(d.school.limits.studentsFull, { max: formatNumber(maxStudents, locale) })} cta={d.plan.upgrade} locale={locale} />
      ) : (
        <Panel>
          <StudentForm
            action={saveStudent.bind(null, locale, null)}
            student={{ class_id: param(sp.class) ?? null }}
            classes={classes}
            t={s}
            common={d.common}
            errors={d.errors}
            submit={s.form.create}
          />
        </Panel>
      )}
    </div>
  );
}
