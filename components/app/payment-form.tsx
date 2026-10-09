import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { recordCustomerPayment, recordOrderPayment, recordOrderRefund, voidPayment } from "@/lib/actions/payments";
import { currencyLabel, format } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";
import { RECEIVE_METHODS } from "@/types/database";

/**
 * Record a payment for one order, towards what a customer owes, or a refund
 * for a cancelled/returned order. Each render carries a fresh client_key:
 * submitting the same form twice records it once.
 */
export function PaymentForm({
  target,
  balance,
  currency,
  t,
  errors,
  today,
  refund = false,
}: {
  target: { orderId: string } | { customerId: string };
  /** Pre-filled amount: what is still owed (or, for a refund, what can be refunded). */
  balance: number;
  currency: string;
  t: Messages["dashboard"]["payments"];
  errors: Messages["dashboard"]["errors"];
  /** Today in the business's time zone (the latest date that can be chosen). */
  today: string;
  refund?: boolean;
}) {
  const hidden = { client_key: crypto.randomUUID(), ...("orderId" in target ? { order_id: target.orderId } : { customer_id: target.customerId }) };
  const action = refund ? recordOrderRefund : "orderId" in target ? recordOrderPayment : recordCustomerPayment;
  const saved = refund ? t.refund.saved : t.saved;
  return (
    <ActionForm action={action} text={{ errors, saved, saving: t.saving }} successMessage={saved} hidden={hidden}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="amount" label={format(refund ? t.refund.amount : t.amount, { currency: currencyLabel(currency) })} defaultValue={String(balance)} inputMode="decimal" required />
        <SelectField name="method" label={refund ? t.refund.method : t.method} defaultValue="cash" options={RECEIVE_METHODS.map((m) => ({ value: m, label: t.methods[m] }))} />
        <TextField name="received_on" label={t.date} hint={t.dateHint} type="date" defaultValue={today} max={today} />
        <TextField name="reference" label={t.reference} hint={t.referenceHint} maxLength={100} />
        <TextField name="note" label={t.note} maxLength={500} className="sm:col-span-2" />
      </div>
      <div>
        <SubmitButton>{refund ? t.refund.submit : t.submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Owners/admins: void a payment recorded by mistake, with a reason. */
export function VoidPaymentForm({
  payments,
  t,
  errors,
}: {
  payments: { groupId: string; label: string }[];
  t: Messages["dashboard"]["payments"];
  errors: Messages["dashboard"]["errors"];
}) {
  return (
    <ActionForm action={voidPayment} text={{ errors, saved: t.void.saved, saving: t.saving }} successMessage={t.void.saved} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="group_id" label={t.columns.kind} placeholder="—" defaultValue="" options={payments.map((p) => ({ value: p.groupId, label: p.label }))} required />
        <TextField name="reason" label={t.void.reason} maxLength={300} required minLength={3} />
      </div>
      <div>
        <SubmitButton variant="outline">{t.void.submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
