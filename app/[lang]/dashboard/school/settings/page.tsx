import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, CheckboxField, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { PageHeader, Panel, StatusBadge, TableWrap, td, th } from "@/components/app/ui";
import { addAssessment, addTerm, applyGradingPreset, createYear, removeAssessment, saveSchoolSettings, setCurrentYear } from "@/lib/actions/school";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getSchoolSettings, listTerms, listYears } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { boundariesText, GRADING_PRESETS } from "@/lib/school/presets";

export const generateMetadata = dashboardMetadata((d) => d.school.settings.title);

/** School profile, grading (presets + every value), report cards, academic years with terms and assessments. */
export default async function SchoolSettingsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/school/settings"));
  const d = t.dashboard;
  const s = d.school.settings;
  const y = d.school.years;
  const canEdit = hasRole(business.role, "admin");
  const [settings, years] = await Promise.all([getSchoolSettings(business.id), listYears(business.id)]);
  const termsByYear = await Promise.all(years.map((yr) => listTerms(business.id, yr.id)));
  const text = { errors: d.errors, saved: s.saved, saving: d.common.saving };
  const example = `${settings.student_prefix}-000001`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={s.title} description={s.description} back={{ href: localizePath(locale, "/dashboard/school"), label: d.school.overview.title }} />
      {!canEdit ? <FormAlert tone="info">{s.adminsOnly}</FormAlert> : null}

      {canEdit ? (
        <Panel title={s.preset} description={s.presetHint}>
          <div className="flex flex-col gap-2" data-testid="grading-presets">
            {GRADING_PRESETS.map((p) => (
              <div key={p} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                <span className="flex items-center gap-2 text-deep">
                  {s.presets[p]}
                  {settings.saved && settings.grading_preset === p ? <StatusBadge tone="green">✓</StatusBadge> : null}
                </span>
                <ActionButton action={applyGradingPreset.bind(null, p)} errors={d.errors}>
                  {s.applyPreset}
                </ActionButton>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <ActionForm action={saveSchoolSettings} text={text} successMessage={s.saved} disabled={!canEdit}>
        <Panel title={s.profile} description={s.profileHint} className="grid gap-5 sm:grid-cols-2">
          <SelectField name="school_type" label={s.schoolType} defaultValue={settings.school_type} options={Object.entries(s.types).map(([value, label]) => ({ value, label }))} />
          <TextField name="registration_number" label={s.registration} defaultValue={settings.registration_number ?? ""} maxLength={80} />
          <TextField name="motto" label={s.motto} defaultValue={settings.motto ?? ""} maxLength={200} />
          <TextField name="principal_name" label={s.principal} defaultValue={settings.principal_name ?? ""} maxLength={120} />
        </Panel>
        <Panel title={s.grading} className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="grading_preset"
            label={s.preset}
            defaultValue={settings.grading_preset}
            options={(["francophone_20", "anglophone_100", "primary", "custom"] as const).map((p) => ({ value: p, label: s.presets[p] }))}
            className="sm:col-span-2"
          />
          <TextField name="scale_max" label={s.scaleMax} defaultValue={String(settings.scale_max)} inputMode="decimal" required />
          <TextField name="pass_mark" label={s.passMark} defaultValue={String(settings.pass_mark)} inputMode="decimal" required />
          <CheckboxField name="use_coefficients" label={s.useCoefficients} defaultChecked={settings.use_coefficients} />
          <CheckboxField name="rank_students" label={s.rankStudents} defaultChecked={settings.rank_students} />
          <SelectField name="missing_marks" label={s.missingMarks} defaultValue={settings.missing_marks} options={(["exclude", "zero"] as const).map((m) => ({ value: m, label: s.missing[m] }))} />
          <SelectField name="decimals" label={s.decimals} defaultValue={String(settings.decimals)} options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))} />
          <TextArea name="grade_boundaries" label={s.boundaries} hint={s.boundariesHint} defaultValue={boundariesText(settings.grade_boundaries)} rows={6} maxLength={2000} className="sm:col-span-2" />
        </Panel>
        <Panel title={s.reports} className="grid gap-5 sm:grid-cols-2">
          <SelectField name="report_template" label={s.template} defaultValue={settings.report_template} options={(["classic", "modern"] as const).map((x) => ({ value: x, label: s.templates[x] }))} />
          <SelectField
            name="report_language"
            label={s.language}
            defaultValue={settings.report_language ?? ""}
            options={[
              { value: "", label: s.sameAsBusiness },
              { value: "fr", label: "Français" },
              { value: "en", label: "English" },
            ]}
          />
          <TextField name="student_prefix" label={s.studentPrefix} hint={format(s.studentPrefixHint, { example })} defaultValue={settings.student_prefix} maxLength={8} required />
        </Panel>
        {canEdit ? (
          <div>
            <SubmitButton>{d.common.save}</SubmitButton>
          </div>
        ) : null}
      </ActionForm>

      <Panel id="years" title={y.title} description={y.description}>
        <div className="flex flex-col gap-6" data-testid="school-years">
          {years.length ? null : <p className="text-sm text-slate">{y.none}</p>}
          {years.map((yr, i) => (
            <section key={yr.id} className="rounded-2xl border border-border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="font-display text-lg font-bold text-deep">{yr.name}</h3>
                {yr.is_current ? <StatusBadge tone="green">{y.current}</StatusBadge> : null}
                {canEdit && !yr.is_current ? (
                  <ActionButton action={setCurrentYear.bind(null, yr.id)} errors={d.errors} variant="ghost">
                    {y.makeCurrent}
                  </ActionButton>
                ) : null}
              </div>
              {termsByYear[i].length ? (
                <div className="flex flex-col gap-4">
                  {termsByYear[i].map((term) => (
                    <div key={term.id}>
                      <p className="mb-1.5 font-semibold text-deep">{term.name}</p>
                      <TableWrap>
                        <thead>
                          <tr>
                            <th className={th}>{y.assessmentName}</th>
                            <th className={`${th} text-right`}>{y.weight}</th>
                            <th className={`${th} text-right`}>{y.maxMark}</th>
                            {canEdit ? <th className={th} /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {term.assessments.map((a) => (
                            <tr key={a.id}>
                              <td className={td}>{a.name}</td>
                              <td className={`${td} text-right`}>{a.weight}</td>
                              <td className={`${td} text-right`}>{a.maxMark}</td>
                              {canEdit ? (
                                <td className={`${td} text-right`}>
                                  <ActionButton action={removeAssessment.bind(null, a.id)} errors={d.errors} variant="ghost" confirm={y.remove + " ?"}>
                                    {y.remove}
                                  </ActionButton>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </TableWrap>
                      {canEdit ? (
                        <ActionForm action={addAssessment.bind(null, term.id)} text={{ ...text, saved: y.addAssessment }} resetOnSuccess className="mt-2">
                          <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem_auto] sm:items-end">
                            <TextField name="name" label={y.assessmentName} maxLength={40} required />
                            <TextField name="weight" label={y.weight} inputMode="decimal" defaultValue="50" required />
                            <TextField name="max_mark" label={y.maxMark} inputMode="decimal" defaultValue={String(settings.scale_max)} required />
                            <SubmitButton variant="outline">{y.addAssessment}</SubmitButton>
                          </div>
                        </ActionForm>
                      ) : null}
                    </div>
                  ))}
                  <p className="text-xs text-slate">{y.weightsHint}</p>
                </div>
              ) : (
                <p className="text-sm text-slate">{y.noTerms}</p>
              )}
              {canEdit ? (
                <ActionForm action={addTerm.bind(null, yr.id)} text={{ ...text, saved: y.addTerm }} resetOnSuccess className="mt-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <TextField name="name" label={y.termName} maxLength={40} required />
                    <SubmitButton variant="outline">{y.addTerm}</SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
            </section>
          ))}
          {canEdit ? (
            <ActionForm action={createYear} text={{ ...text, saved: y.created }} successMessage={y.created} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField name="name" label={y.name} hint={y.nameHint} maxLength={40} required />
                <TextField name="starts_on" label={d.statements.from} type="date" />
                <TextField name="ends_on" label={d.statements.to} type="date" />
                <CheckboxField name="make_current" label={y.makeCurrent} defaultChecked={!years.length} className="sm:col-span-3" />
                <CheckboxField name="with_preset" label={y.withPreset} defaultChecked className="sm:col-span-3" />
              </div>
              <div>
                <SubmitButton>{y.create}</SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
