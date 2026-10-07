import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { saveExpense } from "@/lib/actions/expenses";
import { currencyLabel, format } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";
import { EXPENSE_CATEGORIES, RECEIVE_METHODS } from "@/types/database";

type Expense = { id: string; category: string; amount: number; spent_on: string; description: string | null; payment_method: string | null; reference: string | null };

/** Add an expense (stays on the list, form cleared) or edit one (back to the list). */
export function ExpenseForm({
  expense,
  today,
  currency,
  locale,
  t,
  methods,
  text,
  submitLabel,
}: {
  expense?: Expense;
  /** Today in the business's time zone, YYYY-MM-DD. */
  today: string;
  currency: string;
  locale: string;
  t: Messages["dashboard"]["expenses"];
  methods: Messages["dashboard"]["payments"]["methods"];
  text: { errors: Messages["dashboard"]["errors"]; saved: string; saving: string };
  submitLabel: string;
}) {
  const f = t.fields;
  return (
    <ActionForm action={saveExpense} text={text} successMessage={expense ? undefined : t.saved} resetOnSuccess={!expense} hidden={{ id: expense?.id, locale }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="category"
          label={f.category}
          defaultValue={expense?.category ?? ""}
          placeholder="—"
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t.categories[c] }))}
          required
        />
        <TextField name="amount" label={format(f.amount, { currency: currencyLabel(currency) })} defaultValue={expense ? String(Number(expense.amount)) : ""} inputMode="decimal" required />
        <TextField name="spent_on" type="date" label={f.date} defaultValue={expense?.spent_on ?? today} max={today} required />
        <SelectField
          name="payment_method"
          label={f.method}
          defaultValue={expense?.payment_method ?? ""}
          placeholder="—"
          options={RECEIVE_METHODS.map((m) => ({ value: m, label: methods[m] }))}
        />
        <TextField name="description" label={f.description} hint={f.descriptionHint} defaultValue={expense?.description ?? ""} maxLength={500} className="sm:col-span-2" />
        <TextField name="reference" label={f.reference} defaultValue={expense?.reference ?? ""} maxLength={100} className="sm:col-span-2" />
      </div>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
