import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { recordCustomerPayment, recordOrderPayment } from "@/lib/actions/payments";
import { format } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";
import { RECEIVE_METHODS } from "@/types/database";

/**
 * Record a payment for one order, or towards what a customer owes. Each
 * render carries a fresh client_key: submitting the same form twice records
 * the payment once.
 */
export function PaymentForm({
  target,
  balance,
  currency,
  t,
  errors,
}: {
  target: { orderId: string } | { customerId: string };
  /** Pre-filled amount: what is still owed. */
  balance: number;
  currency: string;
  t: Messages["dashboard"]["payments"];
  errors: Messages["dashboard"]["errors"];
}) {
  const hidden = { client_key: crypto.randomUUID(), ...("orderId" in target ? { order_id: target.orderId } : { customer_id: target.customerId }) };
  return (
    <ActionForm action={"orderId" in target ? recordOrderPayment : recordCustomerPayment} text={{ errors, saved: t.saved, saving: t.saving }} successMessage={t.saved} hidden={hidden}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="amount" label={format(t.amount, { currency })} defaultValue={String(balance)} inputMode="decimal" required />
        <SelectField name="method" label={t.method} defaultValue="cash" options={RECEIVE_METHODS.map((m) => ({ value: m, label: t.methods[m] }))} />
        <TextField name="reference" label={t.reference} hint={t.referenceHint} maxLength={100} className="sm:col-span-2" />
      </div>
      <div>
        <SubmitButton>{t.submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
