import Link from "next/link";
import { Tags, Wallet } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ExpenseForm } from "@/components/app/expense-form";
import { PageHeader, Pagination, Panel, StatCard, TableWrap, formatDate, formatMoney, param, secondaryLink, td, th, withQuery } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { PAGE_SIZE, getPlanLimits, listExpenses, localToday, profitAllowed } from "@/lib/data/queries";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { PLANS } from "@/config/economics";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { EXPENSE_CATEGORIES } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.expenses.title);

const select = "h-10 rounded-xl border border-input bg-card px-3 text-sm text-deep";

/** Expenses by month (owners and admins). */
export default async function ExpensesPage({ searchParams }: PageProps<"/[lang]/dashboard/expenses">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/expenses"));
  const d = t.dashboard;
  const e = d.expenses;
  if (!hasRole(business.role, "admin")) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader title={e.title} description={e.description} />
        <FormAlert tone="info">{e.adminOnly}</FormAlert>
      </div>
    );
  }
  if (!profitAllowed(await getPlanLimits(business.id))) {
    const price = formatMoney(PLANS.find((p) => p.id === "boutique")?.monthlyPrice ?? 0, business.currency, locale);
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader title={e.title} description={e.description} />
        <PlanUpsell title={d.plan.expensesLocked.title} text={format(d.plan.expensesLocked.text, { price })} cta={d.plan.upgrade} locale={locale} />
      </div>
    );
  }
  const today = localToday(business.timezone);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(param(sp.month) ?? "") ? param(sp.month)! : today.slice(0, 7);
  const category = EXPENSE_CATEGORIES.find((c) => c === param(sp.category));
  const filters = { month, category, page: Number(param(sp.page)) || 1 };
  const { rows, total, page, monthTotal, byCategory } = await listExpenses(business.id, filters);
  const base = localizePath(locale, "/dashboard/expenses");
  const money = (v: number | string) => formatMoney(v, business.currency, locale);
  const catLabel = (c: string) => e.categories[c as keyof typeof e.categories] ?? c;
  const methodLabel = (m: string) => d.payments.methods[m as keyof typeof d.payments.methods] ?? m;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  const top = byCategory[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={e.title} description={e.description} />
      {param(sp.saved) ? <FormAlert tone="success">{e.updated}</FormAlert> : null}
      {param(sp.deleted) ? <FormAlert tone="success">{e.deleted}</FormAlert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div data-testid="expenses-month-total">
          <StatCard label={`${e.monthTotal} · ${monthLabel}`} value={money(monthTotal)} icon={Wallet} hint={format(e.count, { count: formatNumber(total, locale) })} noData="—" />
        </div>
        <StatCard label={e.topCategory} value={top ? catLabel(top.category) : null} icon={Tags} hint={top ? money(top.amount) : undefined} noData="—" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <form method="get" action={base} className="mb-4 flex flex-wrap items-end gap-2">
              <label className="flex items-center gap-1.5 text-sm text-slate">
                {e.month}
                <input type="month" name="month" defaultValue={month} max={today.slice(0, 7)} className={select} />
              </label>
              <select name="category" defaultValue={category ?? ""} aria-label={e.fields.category} className={select}>
                <option value="">
                  {e.fields.category}: {d.common.all}
                </option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {e.categories[c]}
                  </option>
                ))}
              </select>
              <button type="submit" className={secondaryLink}>
                {d.common.filter}
              </button>
            </form>
            {rows.length === 0 ? (
              <div className="py-8 text-center">
                <p className="font-semibold text-deep">{category ? e.noResults : e.empty.title}</p>
                {category ? null : <p className="mt-1 text-sm text-slate">{e.empty.text}</p>}
              </div>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    {[e.columns.date, e.columns.category, e.columns.description, e.columns.amount, e.columns.method, e.columns.by, ""].map((h, i) => (
                      <th key={i} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-mint/30" data-expense={r.id}>
                      <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(`${r.spent_on}T12:00:00Z`, locale)}</td>
                      <td className={td}>{catLabel(r.category)}</td>
                      <td className={`${td} text-slate`}>
                        {r.description ?? "—"}
                        {r.reference ? <span className="block text-xs">{r.reference}</span> : null}
                      </td>
                      <td className={`${td} font-semibold whitespace-nowrap`}>{money(r.amount)}</td>
                      <td className={td}>{r.payment_method ? methodLabel(r.payment_method) : "—"}</td>
                      <td className={`${td} text-slate`}>{r.by ?? "—"}</td>
                      <td className={td}>
                        <Link href={localizePath(locale, `/dashboard/expenses/${r.id}`)} className="text-sm font-semibold text-waza-700 hover:underline">
                          {d.common.edit}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} labels={d.common} hrefFor={(n) => withQuery(base, { ...filters, page: n })} />
          </Panel>
          {byCategory.length ? (
            <Panel title={`${e.byCategory} · ${monthLabel}`}>
              <ul className="flex flex-col gap-2.5" data-testid="expenses-by-category">
                {byCategory.map((c) => (
                  <li key={c.category} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span>{catLabel(c.category)}</span>
                      <span className="font-semibold">{money(c.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface">
                      <div className="h-1.5 rounded-full bg-waza-600" style={{ width: `${Math.max(2, Math.round((c.amount / monthTotal) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
        <Panel title={e.add}>
          <ExpenseForm today={today} currency={business.currency} locale={locale} t={e} methods={d.payments.methods} text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }} submitLabel={e.add} />
        </Panel>
      </div>
    </div>
  );
}
