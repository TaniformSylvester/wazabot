import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { DefinitionList, PageHeader, Panel, StatusBadge, formatDate, formatMoney, param } from "@/components/app/ui";
import { documentStatusTone } from "@/components/documents/status";
import { StudentForm } from "@/components/school/student-form";
import { saveStudent } from "@/lib/actions/school";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { displayStatus } from "@/lib/data/documents";
import { getStudent, listClasses, pickYear, studentFees } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.school.students.title);

/** A student: details and guardian, class this year, fees (invoices, paid, balance), published results. */
export default async function StudentPage({ params, searchParams }: PageProps<"/[lang]/dashboard/school/students/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/school/students/${id}`));
  const student = isUuid(id) ? await getStudent(business.id, id) : null;
  if (!student) notFound();
  const d = t.dashboard;
  const s = d.school.students;
  const p = s.profile;
  const href = (x: string) => localizePath(locale, x);
  const { year } = await pickYear(business.id);
  const [classes, fees] = await Promise.all([year ? listClasses(business.id, year.id) : Promise.resolve([]), studentFees(business.id, student.id)]);
  const current = student.school_enrollments.find((e) => e.year_id === year?.id && e.status === "enrolled");
  const money = (v: number) => formatMoney(v, business.currency, locale);
  const guardian = student.customers;

  // Published results of the classes the student was in.
  const db = await createClient();
  const classIds = student.school_enrollments.map((e) => e.class_id);
  const { data: pubs } = classIds.length
    ? await db
        .from("school_result_publications")
        .select("id, class_id, term_id, published_at, school_terms(name), school_classes(name)")
        .eq("business_id", business.id)
        .in("class_id", classIds)
        .is("withdrawn_at", null)
        .order("published_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={`${student.last_name.toUpperCase()} ${student.first_name}`} description={`${p.number} ${student.student_number}`} back={{ href: href("/dashboard/school/students"), label: s.title }} />
      {param(sp.saved) ? <FormAlert tone="success">{s.form.saved}</FormAlert> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={p.fees}>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="student-fees-summary">
              <span>
                {p.billed}: <strong>{money(fees.billed)}</strong>
              </span>
              <span>
                {p.paid}: <strong>{money(fees.paid)}</strong>
              </span>
              <span className={fees.balance > 0 ? "font-semibold text-coral-700" : "font-semibold text-success"}>
                {p.balance}: {money(fees.balance)}
              </span>
            </div>
            {fees.invoices.length ? (
              <ul className="divide-y divide-border" data-testid="student-fees">
                {fees.invoices.map((inv) => {
                  const status = displayStatus(inv as never);
                  const line = Array.isArray(inv.items) ? ((inv.items[0] as { description?: string } | undefined)?.description ?? "") : "";
                  return (
                    <li key={inv.id}>
                      <Link href={href(`/dashboard/documents/${inv.id}`)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:underline">
                        <FileText className="size-4 text-slate" aria-hidden />
                        <span className="font-semibold">{inv.number}</span>
                        <span className="text-slate">{line}</span>
                        <span className="ml-auto font-semibold whitespace-nowrap">{money(Number(inv.total))}</span>
                        <StatusBadge tone={documentStatusTone[status]}>{d.documents.statuses[status]}</StatusBadge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate">{p.noFees}</p>
            )}
          </Panel>
          <Panel title={p.results}>
            {pubs?.length ? (
              <ul className="divide-y divide-border" data-testid="student-results">
                {pubs.map((pub) => (
                  <li key={pub.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="font-semibold text-deep">{pub.school_terms?.name}</span>
                    <span className="text-slate">{pub.school_classes?.name}</span>
                    <span className="text-xs text-slate">{formatDate(pub.published_at, locale)}</span>
                    <a href={href(`/dashboard/school/results/pdf?class=${pub.class_id}&term=${pub.term_id}&student=${student.id}`)} className="ml-auto font-semibold text-waza-700 hover:underline">
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate">{p.noResults}</p>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <Panel title={p.details} className="h-fit">
            <DefinitionList
              rows={[
                { label: p.number, value: student.student_number },
                { label: p.class, value: current?.school_classes?.name ?? "—" },
                { label: s.columns.status, value: s.statuses[student.status as keyof typeof s.statuses] ?? student.status },
                {
                  label: p.guardian,
                  value: guardian ? (
                    <Link href={href(`/dashboard/customers/${guardian.id}`)} className="text-waza-700 hover:underline">
                      {student.guardian_name || guardian.name || guardian.reference} · +{guardian.whatsapp_phone}
                    </Link>
                  ) : (
                    (student.guardian_name ?? p.noGuardian)
                  ),
                },
              ]}
            />
          </Panel>
          {hasRole(business.role, "agent") ? (
            <Panel title={p.edit} className="h-fit">
              <StudentForm
                action={saveStudent.bind(null, locale, student.id)}
                student={{ ...student, guardian_phone: guardian?.whatsapp_phone ?? null, class_id: current?.class_id ?? null }}
                classes={classes}
                t={s}
                common={d.common}
                errors={d.errors}
                submit={s.form.save}
                editing
              />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
