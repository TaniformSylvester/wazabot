import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { ActionButton, ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { Panel, StatusBadge, TableWrap, formatDate, formatMoney, td, th } from "@/components/app/ui";
import { createPaymentReceipt, recordInvoicePayment, voidInvoicePayment } from "@/lib/actions/document-links";
import type { Locale } from "@/lib/i18n/config";
import { currencyLabel, format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import type { Messages } from "@/messages/en";
import { RECEIVE_METHODS } from "@/types/database";

export type InvoicePayment = {
  id: string;
  /** Where the payment lives: an order payment (order's invoice) or an invoice payment. */
  source: "order" | "invoice";
  kind: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  received_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

/**
 * An invoice's payments: what was paid and is still due, each payment with its
 * receipt (or a button to make one), the form to record a payment (staff) and
 * to void one recorded by mistake (owners/admins; an order's payments are
 * voided on the order).
 */
export function InvoicePaymentsPanel({
  invoice,
  payments,
  receipts,
  canRecord,
  canManage,
  today,
  locale,
  t,
  p,
  errors,
}: {
  invoice: { id: string; status: string; total: number; paid: number; currency: string; order: { id: string; number: string } | null };
  payments: InvoicePayment[];
  receipts: Map<string, { id: string; number: string | null }>;
  canRecord: boolean;
  canManage: boolean;
  today: string;
  locale: Locale;
  t: Messages["dashboard"]["documents"]["payments"];
  p: Messages["dashboard"]["payments"];
  errors: Messages["dashboard"]["errors"];
}) {
  const money = (v: number) => formatMoney(v, invoice.currency, locale);
  const due = Math.max(0, invoice.total - invoice.paid);
  const open = invoice.status === "issued" || invoice.status === "partially_paid";
  const methods = invoice.order ? RECEIVE_METHODS : ([...RECEIVE_METHODS.slice(0, -1), "cheque", "other"] as const);
  const live = payments.filter((x) => !x.voided_at && x.kind === "payment");
  return (
    <Panel id="payments" title={t.title}>
      {invoice.order ? (
        <p className="mb-4 text-sm text-slate" data-testid="invoice-order-note">
          {format(t.orderNote, { number: invoice.order.number })}{" "}
          <Link href={localizePath(locale, `/dashboard/orders/${invoice.order.id}`)} className="font-semibold text-waza-700 hover:underline">
            {format(t.openOrder, { number: invoice.order.number })}
          </Link>
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-slate">
          {t.paid}: <span className="font-semibold text-deep" data-testid="invoice-paid">{money(invoice.paid)}</span>
        </p>
        <p className={due > 0 ? "font-display text-lg font-bold text-coral-700" : "font-display text-lg font-bold text-success"} data-testid="invoice-balance">
          {due > 0 ? `${t.balance}: ${money(due)}` : t.paidInFull}
        </p>
      </div>

      {payments.length ? (
        <TableWrap>
          <thead>
            <tr>
              {[p.columns.date, p.columns.amount, p.columns.method, p.columns.reference, p.columns.receipt].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-testid="invoice-payment-rows">
            {payments.map((x) => {
              const receipt = receipts.get(x.id);
              return (
                <tr key={x.id} className={x.voided_at ? "text-slate" : undefined} data-voided={x.voided_at ? "1" : undefined}>
                  <td className={`${td} whitespace-nowrap text-slate`}>
                    {formatDate(x.received_at, locale, true)}
                    {x.voided_at ? <span className="mt-1 block text-xs">{format(p.voidedInfo, { date: formatDate(x.voided_at, locale, true), reason: x.void_reason ?? "" })}</span> : null}
                  </td>
                  <td className={`${td} font-semibold whitespace-nowrap ${x.voided_at ? "line-through" : ""}`}>
                    {x.kind === "refund" ? "−" : ""}
                    {money(x.amount)}
                    {x.kind === "refund" ? <StatusBadge tone="neutral">{p.kinds.refund}</StatusBadge> : null}
                  </td>
                  <td className={td}>{p.methods[x.method as keyof typeof p.methods] ?? x.method}</td>
                  <td className={`${td} text-slate`}>
                    {x.reference ?? "—"}
                    {x.note ? <span className="block text-xs">{x.note}</span> : null}
                  </td>
                  <td className={td}>
                    {receipt ? (
                      <Link href={localizePath(locale, `/dashboard/documents/${receipt.id}`)} className="font-semibold whitespace-nowrap text-waza-700 hover:underline" data-testid="payment-receipt-link">
                        {receipt.number}
                      </Link>
                    ) : !x.voided_at && x.kind === "payment" && canRecord ? (
                      <ActionButton action={createPaymentReceipt.bind(null, x.source, x.id, locale)} errors={errors}>
                        <ReceiptText aria-hidden /> {t.makeReceipt}
                      </ActionButton>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      ) : (
        <p className="text-sm text-slate">{t.none}</p>
      )}
      <p className="mt-3 text-xs text-slate">{t.receiptOnly}</p>

      {invoice.status === "draft" ? <p className="mt-4 text-sm text-slate">{t.draftNote}</p> : null}
      {invoice.status === "voided" ? <p className="mt-4 text-sm text-slate">{t.voidedNote}</p> : null}
      {canRecord && open && due > 0 ? (
        <div className="mt-5 border-t border-border pt-5" data-testid="record-invoice-payment">
          <p className="mb-3 font-semibold text-deep">{t.record}</p>
          <ActionForm action={recordInvoicePayment.bind(null, invoice.id)} text={{ errors, saved: p.saved, saving: p.saving }} successMessage={p.saved} hidden={{ client_key: crypto.randomUUID() }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="amount" label={format(p.amount, { currency: currencyLabel(invoice.currency) })} defaultValue={String(due)} inputMode="decimal" required />
              <SelectField name="method" label={p.method} defaultValue="cash" options={methods.map((m) => ({ value: m, label: p.methods[m] }))} />
              <TextField name="received_on" label={p.date} hint={p.dateHint} type="date" defaultValue={today} max={today} />
              <TextField name="reference" label={p.reference} hint={p.referenceHint} maxLength={100} />
              <TextField name="note" label={p.note} maxLength={500} className="sm:col-span-2" />
            </div>
            <div>
              <SubmitButton>{p.submit}</SubmitButton>
            </div>
          </ActionForm>
          <p className="mt-3 text-xs text-slate">{p.manualNote}</p>
        </div>
      ) : null}

      {canManage && !invoice.order && live.length ? (
        <details className="mt-5 border-t border-border pt-5" data-testid="void-invoice-payment">
          <summary className="flex min-h-8 cursor-pointer items-center text-sm font-semibold text-slate hover:text-deep">{p.void.title}</summary>
          <p className="my-3 text-sm text-slate">{p.void.text}</p>
          <ActionForm action={voidInvoicePayment} text={{ errors, saved: p.void.saved, saving: p.saving }} successMessage={p.void.saved} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="payment_id"
                label={p.columns.kind}
                placeholder="—"
                defaultValue=""
                options={live.map((x) => ({ value: x.id, label: `${money(x.amount)} · ${formatDate(x.received_at, locale)}${x.reference ? ` · ${x.reference}` : ""}` }))}
                required
              />
              <TextField name="reason" label={p.void.reason} maxLength={300} required minLength={3} />
            </div>
            <div>
              <SubmitButton variant="outline">{p.void.submit}</SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
    </Panel>
  );
}
