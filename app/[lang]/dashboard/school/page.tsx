import Link from "next/link";
import { Backpack, Banknote, CheckCircle2, Circle, ClipboardCheck, School, Settings } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/app/form";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { PageHeader, Panel, StatCard, formatMoney, secondaryLink } from "@/components/app/ui";
import { UsageMeter } from "@/components/app/usage-meter";
import { cheapestPlanWith, type Plan } from "@/config/plans";
import { setModule } from "@/lib/actions/school";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getEntitlements, limitInForce } from "@/lib/data/queries";
import { feeSummary, getSchoolSettings, listClasses, listFeeItems, listSubjects, listTerms, pickYear, termReportCardUsage } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { getBusinessModules } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.school.overview.title);

/** School overview: switch the module on, the setup checklist, key numbers; for teachers, their classes and subjects. */
export default async function SchoolPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { user, business } = await requireBusiness(localizePath(locale, "/dashboard/school"));
  const d = t.dashboard;
  const s = d.school;
  const o = s.overview;
  const href = (p: string) => localizePath(locale, p);
  const modules = await getBusinessModules(business);
  const isAdmin = hasRole(business.role, "admin");
  const teacher = business.role === "teacher";

  if (!modules.includes("school")) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title={o.title} description={o.description} />
        <Panel title={o.enableTitle} description={o.enableText}>
          {isAdmin ? (
            <ActionButton action={setModule.bind(null, "school", true)} errors={t.dashboard.errors} variant="default">
              {o.enable}
            </ActionButton>
          ) : (
            <FormAlert tone="info">{o.ownersOnly}</FormAlert>
          )}
        </Panel>
      </div>
    );
  }

  const [settings, { year }, subjects] = await Promise.all([getSchoolSettings(business.id), pickYear(business.id), listSubjects(business.id)]);
  const [terms, classes] = year ? await Promise.all([listTerms(business.id, year.id), listClasses(business.id, year.id)]) : [[], []];
  const db = await createClient();

  if (teacher) {
    const { data: mine } = await db
      .from("class_subjects")
      .select("id, class_id, school_subjects(name), school_classes(name)")
      .eq("business_id", business.id)
      .eq("teacher_id", user.id);
    const leading = classes.filter((c) => c.classTeacherId === user.id);
    const term = terms[0];
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader title={o.title} description={business.name} />
        <Panel title={o.mySubjects}>
          {mine?.length ? (
            <ul className="divide-y divide-border" data-testid="teacher-subjects">
              {mine.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <span className="font-semibold text-deep">{m.school_subjects?.name}</span> · {m.school_classes?.name}
                  </span>
                  {term ? (
                    <Link href={href(`/dashboard/school/classes/${m.class_id}/marks?subject=${m.id}&term=${term.id}`)} className="font-semibold text-waza-700 hover:underline">
                      {o.enterMarks}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">{o.noClasses}</p>
          )}
        </Panel>
        {leading.length ? (
          <Panel title={o.classTeacherOf}>
            <ul className="flex flex-col gap-2 text-sm">
              {leading.map((c) => (
                <li key={c.id}>
                  <Link href={href(`/dashboard/school/classes/${c.id}`)} className="font-semibold text-waza-700 hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    );
  }

  const [{ count: students }, { count: published }, fees, ent, termUsage] = await Promise.all([
    db.from("school_students").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "active"),
    db.from("school_result_publications").select("id", { count: "exact", head: true }).eq("business_id", business.id).is("withdrawn_at", null),
    year ? listFeeItems(business.id, year.id) : Promise.resolve([]),
    getEntitlements(business.id),
    Promise.all(terms.map((x) => termReportCardUsage(x.id))),
  ]);
  const maxStudents = limitInForce(ent, ent?.maxStudents);
  const maxReportCards = limitInForce(ent, ent?.maxReportCardStudents);
  const studentsFull = maxStudents !== null && (ent?.studentsUsed ?? 0) >= maxStudents;
  const lim = s.limits;
  const planName = (has: (p: Plan) => boolean) => {
    const p = cheapestPlanWith(has);
    return p ? t.pricing.plans[p.id].name : "";
  };
  const summary = await feeSummary(business.id, fees.map((f) => f.id));
  const due = [...summary.byFee.values()].reduce((sum, f) => sum + f.billed - f.paid, 0);
  const steps: [string, boolean, string][] = [
    [o.setup.profile, settings.saved, "/dashboard/school/settings"],
    [o.setup.year, !!year && terms.length > 0 && terms.every((x) => x.assessments.length > 0), "/dashboard/school/settings#years"],
    [o.setup.subjects, subjects.length > 0, "/dashboard/school/classes#subjects"],
    [o.setup.classes, classes.length > 0 && classes.every((c) => c.subjects > 0), "/dashboard/school/classes"],
    [o.setup.students, (students ?? 0) > 0, "/dashboard/school/students"],
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={o.title}
        description={o.description}
        actions={
          isAdmin ? (
            <Link href={href("/dashboard/school/settings")} className={secondaryLink}>
              <Settings aria-hidden /> {o.settings}
            </Link>
          ) : null
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="school-stats">
        <StatCard label={o.stats.students} value={String(students ?? 0)} icon={Backpack} noData="—" />
        <StatCard label={o.stats.classes} value={String(classes.length)} icon={School} noData="—" />
        <StatCard label={o.stats.published} value={String(published ?? 0)} icon={ClipboardCheck} noData="—" />
        <StatCard label={o.stats.feesDue} value={formatMoney(Math.max(0, due), business.currency, locale)} icon={Banknote} noData="—" />
      </div>
      {ent ? (
        <Panel title={lim.title} description={lim.description}>
          <dl className="grid gap-3 sm:grid-cols-3" data-testid="school-usage">
            <UsageMeter label={lim.students} used={ent.studentsUsed} max={maxStudents} locale={locale} text={d.plan.usage} />
            <UsageMeter label={lim.teachers} used={ent.teachersUsed} max={ent.maxTeachers} locale={locale} text={d.plan.usage} />
            {terms.map((x, i) => (
              <UsageMeter key={x.id} label={format(lim.reportCards, { term: x.name })} used={termUsage[i]} max={maxReportCards} locale={locale} text={d.plan.usage} />
            ))}
          </dl>
          {studentsFull ? (
            <div className="mt-4">
              <PlanUpsell compact text={format(lim.studentsFull, { max: formatNumber(maxStudents, locale) })} cta={d.plan.upgrade} locale={locale} />
            </div>
          ) : null}
          {ent.enforced && !ent.hasBulkReportCards ? <p className="mt-3 text-xs text-slate">{format(lim.bulkNote, { plan: planName((p) => p.hasBulkReportCards) })}</p> : null}
        </Panel>
      ) : null}
      {steps.some(([, ok]) => !ok) ? (
        <Panel title={o.setupTitle}>
          <ol className="flex flex-col gap-2.5" data-testid="school-setup">
            {steps.map(([label, ok, p]) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                {ok ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <Circle className="size-5 text-slate" aria-hidden />}
                <Link href={href(p)} className={ok ? "text-slate line-through" : "font-semibold text-deep hover:underline"}>
                  {label}
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </div>
  );
}
