import { PaymentForm } from "@/components/app/payment-form";
import { Panel, TableWrap, formatDate, formatMoney, td, th } from "@/components/app/ui";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/messages/en";

type Payment = { id: string; amount: number; method: string; reference: string | null; received_at: string; by: string | null };

/** A sale's or order's payments: what was paid, the balance due, and the form to record the next payment. */
export function PaymentsPanel({
  order,
  payments,
  canRecord,
  locale,
  t,
  errors,
}: {
  order: { id: string; total: number; paid: number; currency: string; cancelled: boolean };
  payments: Payment[];
  canRecord: boolean;
  locale: Locale;
  t: Messages["dashboard"]["payments"];
  errors: Messages["dashboard"]["errors"];
}) {
  const due = Math.max(0, order.total - order.paid);
  const money = (v: number) => formatMoney(v, order.currency, locale);
  return (
    <Panel id="payments" title={t.title}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-slate">
          {t.paid}: <span className="font-semibold text-deep">{money(order.paid)}</span>
        </p>
        <p className={due > 0 ? "font-display text-lg font-bold text-coral-700" : "font-display text-lg font-bold text-success"} data-testid="balance-due">
          {due > 0 ? `${t.balance}: ${money(due)}` : t.paidInFull}
        </p>
      </div>
      {payments.length ? (
        <TableWrap>
          <thead>
            <tr>
              {[t.columns.date, t.columns.amount, t.columns.method, t.columns.reference, t.columns.by].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(p.received_at, locale, true)}</td>
                <td className={`${td} font-semibold whitespace-nowrap`}>{money(Number(p.amount))}</td>
                <td className={td}>{t.methods[p.method as keyof typeof t.methods] ?? p.method}</td>
                <td className={`${td} text-slate`}>{p.reference ?? "—"}</td>
                <td className={`${td} text-slate`}>{p.by ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <p className="text-sm text-slate">{t.none}</p>
      )}
      {canRecord && due > 0 && !order.cancelled ? (
        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 font-semibold text-deep">{t.record}</p>
          <PaymentForm target={{ orderId: order.id }} balance={due} currency={order.currency} t={t} errors={errors} />
          <p className="mt-3 text-xs text-slate">{t.manualNote}</p>
        </div>
      ) : null}
    </Panel>
  );
}
