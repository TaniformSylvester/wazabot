import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { DeleteButton } from "@/components/app/form";
import { ExpenseForm } from "@/components/app/expense-form";
import { PageHeader, Panel } from "@/components/app/ui";
import { deleteExpense } from "@/lib/actions/expenses";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getExpense, localToday } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.expenses.edit);

export default async function ExpensePage({ params }: PageProps<"/[lang]/dashboard/expenses/[id]">) {
  const [locale, t, { id }] = await Promise.all([getLocale(), getMessages(), params]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/expenses/${id}`));
  const d = t.dashboard;
  const e = d.expenses;
  const back = { href: localizePath(locale, "/dashboard/expenses"), label: e.title };
  if (!hasRole(business.role, "admin")) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title={e.edit} back={back} />
        <FormAlert tone="info">{e.adminOnly}</FormAlert>
      </div>
    );
  }
  const expense = isUuid(id) ? await getExpense(business.id, id) : null;
  if (!expense) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={e.edit} back={{ href: localizePath(locale, `/dashboard/expenses?month=${expense.spent_on.slice(0, 7)}`), label: e.title }} />
      <Panel>
        <ExpenseForm
          expense={expense}
          today={localToday(business.timezone)}
          currency={business.currency}
          locale={locale}
          t={e}
          methods={d.payments.methods}
          text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }}
          submitLabel={d.common.save}
        />
      </Panel>
      <div>
        <DeleteButton action={deleteExpense.bind(null, expense.id, locale)} labels={d.common} errors={d.errors} />
      </div>
    </div>
  );
}
