import Link from "next/link";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { PageHeader, Panel, TableWrap, formatDate, formatMoney, td, th } from "@/components/app/ui";
import { billFee, createFee } from "@/lib/actions/school";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { feeSummary, listClasses, listFeeItems, pickYear } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { currencyLabel, format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.school.fees.title);

/** School fees of the year: fees (class or whole school), billing them as invoices, balances by student. */
export default async function FeesPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/school/fees"));
  const d = t.dashboard;
  const f = d.school.fees;
  const isAdmin = hasRole(business.role, "admin");
  const href = (p: string) => localizePath(locale, p);
  const money = (v: number) => formatMoney(v, business.currency, locale);
  const { year } = await pickYear(business.id);
  const [fees, classes] = year ? await Promise.all([listFeeItems(business.id, year.id), listClasses(business.id, year.id)]) : [[], []];
  const summary = await feeSummary(business.id, fees.map((x) => x.id));
  const studentIds = [...summary.byStudent.keys()];
  const db = await createClient();
  const { data: students } = studentIds.length
    ? await db.from("school_students").select("id, student_number, first_name, last_name").eq("business_id", business.id).in("id", studentIds.slice(0, 1000))
    : { data: [] };
  const balances = (students ?? [])
    .map((s) => ({ ...s, ...summary.byStudent.get(s.id)! }))
    .sort((a, b) => b.billed - b.paid - (a.billed - a.paid) || a.last_name.localeCompare(b.last_name));
  const text = { errors: d.errors, saved: f.created, saving: d.common.saving };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={year ? `${f.title} · ${year.name}` : f.title} description={f.description} />
      {!year ? <FormAlert tone="info">{d.school.overview.noYear}</FormAlert> : null}
      {!isAdmin ? <FormAlert tone="info">{f.adminsOnly}</FormAlert> : null}
      <Panel>
        {fees.length ? (
          <TableWrap>
            <thead>
              <tr>
                {[f.columns.fee, f.columns.class, f.columns.amount, f.columns.invoices, f.columns.billed, f.columns.paid, f.columns.balance, ""].map((h, i) => (
                  <th key={i} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody data-testid="fee-rows">
              {fees.map((fee) => {
                const s = summary.byFee.get(fee.id) ?? { invoices: 0, billed: 0, paid: 0 };
                return (
                  <tr key={fee.id}>
                    <td className={td} data-label={f.columns.fee}>
                      <span className="font-semibold text-deep">{fee.name}</span>
                      {fee.due_date ? <span className="block text-xs text-slate">{formatDate(fee.due_date, locale)}</span> : null}
                    </td>
                    <td className={td} data-label={f.columns.class}>
                      {fee.school_classes?.name ?? f.allClasses}
                    </td>
                    <td className={`${td} whitespace-nowrap`} data-label={f.columns.amount}>
                      {money(Number(fee.amount))}
                    </td>
                    <td className={td} data-label={f.columns.invoices}>
                      {s.invoices}
                    </td>
                    <td className={`${td} whitespace-nowrap`} data-label={f.columns.billed}>
                      {money(s.billed)}
                    </td>
                    <td className={`${td} whitespace-nowrap`} data-label={f.columns.paid}>
                      {money(s.paid)}
                    </td>
                    <td className={`${td} font-semibold whitespace-nowrap`} data-label={f.columns.balance}>
                      {money(Math.max(0, s.billed - s.paid))}
                    </td>
                    <td className={td}>
                      {isAdmin ? (
                        <ActionButton action={billFee.bind(null, fee.id)} errors={d.errors} confirm={f.billConfirm}>
                          {f.bill}
                        </ActionButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-slate">{f.empty}</p>
        )}
        {isAdmin && year ? (
          <ActionForm action={createFee.bind(null, year.id)} text={text} successMessage={f.created} resetOnSuccess className="mt-5 border-t border-border pt-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <TextField name="name" label={f.name} maxLength={80} required />
              <TextField name="amount" label={format(f.amount, { currency: currencyLabel(business.currency) })} inputMode="decimal" required />
              <SelectField name="class_id" label={f.class} defaultValue="" options={[{ value: "", label: f.allClasses }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} />
              <TextField name="due_date" label={f.dueDate} type="date" />
            </div>
            <div>
              <SubmitButton>{f.create}</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
        <p className="mt-4 text-xs text-slate">{f.note}</p>
      </Panel>

      <Panel title={f.balances}>
        {balances.length ? (
          <TableWrap>
            <thead>
              <tr>
                {[d.school.students.columns.number, d.school.students.columns.name, f.columns.billed, f.columns.paid, f.columns.balance].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody data-testid="balance-rows">
              {balances.map((b) => (
                <tr key={b.id}>
                  <td className={`${td} font-mono text-xs`} data-label={d.school.students.columns.number}>
                    {b.student_number}
                  </td>
                  <td className={td} data-label={d.school.students.columns.name}>
                    <Link href={href(`/dashboard/school/students/${b.id}`)} className="font-semibold text-waza-700 hover:underline">
                      {b.last_name.toUpperCase()} {b.first_name}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap`} data-label={f.columns.billed}>
                    {money(b.billed)}
                  </td>
                  <td className={`${td} whitespace-nowrap`} data-label={f.columns.paid}>
                    {money(b.paid)}
                  </td>
                  <td className={`${td} font-semibold whitespace-nowrap ${b.billed - b.paid > 0 ? "text-coral-700" : "text-success"}`} data-label={f.columns.balance}>
                    {money(Math.max(0, b.billed - b.paid))}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-slate">{f.balancesEmpty}</p>
        )}
      </Panel>
    </div>
  );
}
