import { Download, Printer } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { FilterSelect } from "@/components/school/filter-select";
import { PageHeader, Panel, StatusBadge, TableWrap, buttonLink, formatDate, param, secondaryLink, td, th } from "@/components/app/ui";
import { SendOnWhatsApp } from "@/components/documents/send-whatsapp";
import { publishResults, saveTermComment, sendReportCard, withdrawResults } from "@/lib/actions/school";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { cheapestPlanWith } from "@/config/plans";
import { bulkReportCardsAllowed, getEntitlements, limitInForce } from "@/lib/data/queries";
import { computeReportCards, getPublication, listClasses, listPublications, listTerms, pickYear, termReportCardUsage } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { formatScore } from "@/lib/school/report-card";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.school.results.title);

/**
 * Results of a class for a term: computed from the current marks until
 * published (provisional), then the frozen snapshot. Comments, publishing,
 * withdrawing, report cards (PDF, print) and sending them to parents.
 */
export default async function ResultsPage({ searchParams }: PageProps<"/[lang]/dashboard/school/results">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { user, business } = await requireBusiness(localizePath(locale, "/dashboard/school/results"));
  const d = t.dashboard;
  const r = d.school.results;
  const isAdmin = hasRole(business.role, "admin");
  const { year } = await pickYear(business.id);
  const [classes, terms] = year ? await Promise.all([listClasses(business.id, year.id), listTerms(business.id, year.id)]) : [[], []];
  const klass = classes.find((c) => c.id === param(sp.class)) ?? (classes.length === 1 ? classes[0] : null);
  const term = terms.find((x) => x.id === param(sp.term)) ?? terms[0] ?? null;
  const pub = klass && term ? await getPublication(business.id, term.id, klass.id) : null;
  const data = pub?.data ?? (klass && term ? await computeReportCards(business, klass.id, term.id) : null);
  const history = klass ? (await listPublications(business.id, klass.id)).filter((p) => p.term_id === term?.id && p.withdrawn_at) : [];
  const text = { errors: d.errors, saved: d.common.saved, saving: d.common.saving };
  const pdf = klass && term ? localizePath(locale, `/dashboard/school/results/pdf?class=${klass.id}&term=${term.id}`) : "";
  const isClassTeacher = !!klass && klass.classTeacherId === user.id;
  const canComment = !pub && (isAdmin || isClassTeacher);
  // The class teacher (or an admin) writes the class teacher's comment; only owners/admins the principal's.
  const commentKinds: ("class_teacher" | "principal")[] = [...(isAdmin || isClassTeacher ? (["class_teacher"] as const) : []), ...(isAdmin ? (["principal"] as const) : [])];
  const n = (v: number | null) => (data ? formatScore(v, data.settings.decimals, locale) : "—");
  const lim = d.school.limits;
  const ent = await getEntitlements(business.id);
  // Free: report cards one student at a time (the PDF route refuses a whole class too).
  const bulk = bulkReportCardsAllowed(ent);
  const bulkPlan = cheapestPlanWith((p) => p.hasBulkReportCards);
  const maxReportCards = limitInForce(ent, ent?.maxReportCardStudents);
  const reportCardsUsed = maxReportCards !== null && term && isAdmin ? await termReportCardUsage(term.id) : 0;

  // Parents' numbers (to send published report cards).
  let guardians = new Set<string>();
  if (pub && hasRole(business.role, "agent")) {
    const db = await createClient();
    const { data: rows } = await db.from("school_students").select("id").eq("business_id", business.id).in("id", pub.data.students.map((s) => s.id)).not("guardian_customer_id", "is", null);
    guardians = new Set((rows ?? []).map((x) => x.id));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={r.title} description={r.description} />
      <form method="get" className="flex flex-wrap items-end gap-2" data-testid="results-filters">
        <FilterSelect name="class" label={r.class} defaultValue={klass?.id ?? ""} placeholder="—" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect name="term" label={r.term} defaultValue={term?.id ?? ""} options={terms.map((x) => ({ value: x.id, label: x.name }))} />
        <button type="submit" className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">
          {r.show}
        </button>
      </form>

      {!klass || !term || !data ? (
        <FormAlert tone="info">{year ? r.chooseClass : d.school.overview.noYear}</FormAlert>
      ) : (
        <>
          <FormAlert tone={pub ? "success" : "info"}>{pub ? format(r.published, { date: formatDate(pub.publishedAt, locale, true) }) : r.provisional}</FormAlert>
          {!bulk ? (
            isAdmin ? (
              <PlanUpsell compact text={format(lim.bulkLocked, { plan: bulkPlan ? t.pricing.plans[bulkPlan.id].name : "" })} cta={d.plan.upgrade} locale={locale} />
            ) : (
              <p className="text-sm text-slate" data-testid="bulk-locked">{format(lim.bulkLocked, { plan: bulkPlan ? t.pricing.plans[bulkPlan.id].name : "" })}</p>
            )
          ) : null}
          {isAdmin && maxReportCards !== null ? (
            <p className="text-sm text-slate" data-testid="report-card-usage">
              {format(lim.publishUsage, { used: formatNumber(reportCardsUsed, locale), max: formatNumber(maxReportCards, locale) })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {bulk ? (
              <>
                <a href={pdf} className={buttonLink} data-testid="report-cards-pdf">
                  <Download aria-hidden /> {pub ? r.downloadAll : r.provisionalPdf}
                </a>
                <a href={`${pdf}&inline=1`} target="_blank" rel="noopener" className={secondaryLink}>
                  <Printer aria-hidden /> {r.printAll}
                </a>
              </>
            ) : null}
            {isAdmin && !pub && data.students.length ? (
              <ActionButton action={publishResults.bind(null, klass.id, term.id)} errors={d.errors} variant="dark" confirm={r.publishConfirm}>
                {r.publish}
              </ActionButton>
            ) : null}
          </div>

          <Panel title={`${klass.name} · ${term.name}`}>
            <p className="mb-3 text-sm text-slate" data-testid="results-stats">
              {format(r.stats, { average: n(data.stats.classAverage), highest: n(data.stats.highest), lowest: n(data.stats.lowest), passed: data.stats.passed, ranked: data.stats.ranked })}
            </p>
            {data.students.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    {[...(data.settings.rankStudents ? [r.columns.rank] : []), r.columns.student, r.columns.average, r.columns.grade, r.columns.decision, ""].map((h, i) => (
                      <th key={i} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="result-rows">
                  {[...data.students]
                    .sort((a, b) => (a.result.rank ?? 1e9) - (b.result.rank ?? 1e9) || a.name.localeCompare(b.name))
                    .map((st) => (
                      <tr key={st.id}>
                        {data.settings.rankStudents ? (
                          <td className={`${td} font-semibold`} data-label={r.columns.rank}>
                            {st.result.rank ?? "—"}
                          </td>
                        ) : null}
                        <td className={td} data-label={r.columns.student}>
                          <span className="font-semibold text-deep">{st.name}</span>
                          <span className="block font-mono text-xs text-slate">{st.number}</span>
                          {canComment ? (
                            <details className="mt-2" data-testid="comments">
                              <summary className="cursor-pointer text-xs font-semibold text-waza-700">{r.comments}</summary>
                              <div className="mt-2 flex flex-col gap-3">
                                {commentKinds.map((kind) => (
                                  <ActionForm key={kind} action={saveTermComment} text={{ ...text, saved: r.commentSaved }} successMessage={r.commentSaved} hidden={{ kind, term_id: term.id, student_id: st.id }}>
                                    <TextArea
                                      name="comment"
                                      label={kind === "principal" ? r.principalComment : r.classTeacherComment}
                                      defaultValue={(kind === "principal" ? st.principalComment : st.classTeacherComment) ?? ""}
                                      maxLength={500}
                                      rows={2}
                                    />
                                    <div>
                                      <SubmitButton variant="outline">{r.saveComment}</SubmitButton>
                                    </div>
                                  </ActionForm>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </td>
                        <td className={`${td} font-semibold whitespace-nowrap`} data-label={r.columns.average}>
                          {n(st.result.average)}
                        </td>
                        <td className={td} data-label={r.columns.grade}>
                          {st.result.grade ?? "—"}
                        </td>
                        <td className={td} data-label={r.columns.decision}>
                          {st.result.passed === null ? "—" : <StatusBadge tone={st.result.passed ? "green" : "red"}>{st.result.passed ? r.passed : r.notPassed}</StatusBadge>}
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap items-center gap-2">
                            <a href={`${pdf}&student=${st.id}`} className="font-semibold text-waza-700 hover:underline">
                              {r.downloadOne}
                            </a>
                            {pub && hasRole(business.role, "agent") ? (
                              guardians.has(st.id) ? (
                                <SendOnWhatsApp action={sendReportCard.bind(null, klass.id, term.id, st.id)} label={r.sendWhatsApp} pendingLabel={d.documents.whatsapp.sending} sentLabel={r.sent} errors={d.errors} />
                              ) : (
                                <span className="text-xs text-slate">{r.noGuardian}</span>
                              )
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </TableWrap>
            ) : (
              <p className="text-sm text-slate">{r.noStudents}</p>
            )}
            {pub ? <p className="mt-3 text-xs text-slate">{d.documents.whatsapp.windowRule}</p> : null}
          </Panel>

          {isAdmin && pub ? (
            <Panel title={r.withdrawTitle} description={r.withdrawText}>
              <ActionForm action={withdrawResults.bind(null, pub.id)} text={{ ...text, saved: r.withdrawn }} successMessage={r.withdrawn}>
                <TextField name="reason" label={r.withdrawReason} required minLength={3} maxLength={300} />
                <div>
                  <SubmitButton variant="outline">{r.withdrawSubmit}</SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          ) : null}
          {history.length ? (
            <Panel title={r.history}>
              <ul className="flex flex-col gap-1 text-sm text-slate">
                {history.map((h) => (
                  <li key={h.id}>{format(r.withdrawnOn, { date: formatDate(h.withdrawn_at!, locale, true), reason: h.withdraw_reason ?? "" })}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
