import { PaymentForm, VoidPaymentForm } from "@/components/app/payment-form";
import { Panel, StatusBadge, TableWrap, formatDate, formatMoney, td, th } from "@/components/app/ui";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";

type Payment = {
  id: string;
  group_id: string;
  kind: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  received_at: string;
  by: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

/**
 * A sale's or order's payments and refunds: what was paid, refunded and is
 * still due, the history (voided entries stay, struck through), and the forms
 * to record a payment (agents), a refund or a void (owners/admins).
 */
export function PaymentsPanel({
  order,
  payments,
  canRecord,
  canManage,
  today,
  locale,
  t,
  errors,
}: {
  order: { id: string; total: number; paid: number; refunded: number; currency: string; closed: boolean };
  payments: Payment[];
  canRecord: boolean;
  /** Owners/admins: refunds and voids. */
  canManage: boolean;
  today: string;
  locale: Locale;
  t: Messages["dashboard"]["payments"];
  errors: Messages["dashboard"]["errors"];
}) {
  const due = order.closed ? 0 : Math.max(0, order.total - order.paid);
  const refundable = Math.max(0, order.paid - order.refunded);
  const money = (v: number) => formatMoney(v, order.currency, locale);
  const valid = payments.filter((p) => !p.voided_at);
  return (
    <Panel id="payments" title={t.title}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-slate">
          {t.paid}: <span className="font-semibold text-deep">{money(order.paid)}</span>
          {order.refunded > 0 ? (
            <>
              {" · "}
              {t.refunded}: <span className="font-semibold text-deep">{money(order.refunded)}</span>
            </>
          ) : null}
        </p>
        <p className={due > 0 ? "font-display text-lg font-bold text-coral-700" : "font-display text-lg font-bold text-success"} data-testid="balance-due">
          {due > 0 ? `${t.balance}: ${money(due)}` : order.closed ? "—" : t.paidInFull}
        </p>
      </div>
      {payments.length ? (
        <TableWrap>
          <thead>
            <tr>
              {[t.columns.date, t.columns.kind, t.columns.amount, t.columns.method, t.columns.reference, t.columns.by].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-testid="payment-rows">
            {payments.map((p) => (
              <tr key={p.id} className={p.voided_at ? "text-slate" : undefined} data-voided={p.voided_at ? "1" : undefined}>
                <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(p.received_at, locale, true)}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge tone={p.kind === "refund" ? "neutral" : "green"}>{t.kinds[p.kind as keyof typeof t.kinds] ?? p.kind}</StatusBadge>
                    {p.voided_at ? <StatusBadge tone="red">{t.voided}</StatusBadge> : null}
                  </div>
                  {p.voided_at ? <p className="mt-1 text-xs">{format(t.voidedInfo, { date: formatDate(p.voided_at, locale, true), reason: p.void_reason ?? "" })}</p> : null}
                </td>
                <td className={`${td} font-semibold whitespace-nowrap ${p.voided_at ? "line-through" : ""}`}>
                  {p.kind === "refund" ? "−" : ""}
                  {money(Number(p.amount))}
                </td>
                <td className={td}>{t.methods[p.method as keyof typeof t.methods] ?? p.method}</td>
                <td className={`${td} text-slate`}>
                  {p.reference ?? "—"}
                  {p.note ? <span className="block text-xs">{p.note}</span> : null}
                </td>
                <td className={`${td} text-slate`}>{p.by ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <p className="text-sm text-slate">{t.none}</p>
      )}
      {canRecord && due > 0 ? (
        <div className="mt-5 border-t border-border pt-5" data-testid="record-payment">
          <p className="mb-3 font-semibold text-deep">{t.record}</p>
          <PaymentForm target={{ orderId: order.id }} balance={due} currency={order.currency} t={t} errors={errors} today={today} />
          <p className="mt-3 text-xs text-slate">{t.manualNote}</p>
        </div>
      ) : null}
      {canManage && order.closed && refundable > 0 ? (
        <div className="mt-5 border-t border-border pt-5" data-testid="record-refund">
          <p className="font-semibold text-deep">{t.refund.title}</p>
          <p className="mb-3 text-sm text-slate">{t.refund.text}</p>
          <PaymentForm target={{ orderId: order.id }} balance={refundable} currency={order.currency} t={t} errors={errors} today={today} refund />
        </div>
      ) : null}
      {canManage && valid.length ? (
        <details className="mt-5 border-t border-border pt-5" data-testid="void-payment">
          <summary className="cursor-pointer text-sm font-semibold text-slate hover:text-deep">{t.void.title}</summary>
          <p className="my-3 text-sm text-slate">{t.void.text}</p>
          <VoidPaymentForm
            payments={valid.map((p) => ({
              groupId: p.group_id,
              label: `${t.kinds[p.kind as keyof typeof t.kinds] ?? p.kind} · ${money(Number(p.amount))} · ${formatDate(p.received_at, locale)}${p.reference ? ` · ${p.reference}` : ""}`,
            }))}
            t={t}
            errors={errors}
          />
        </details>
      ) : null}
    </Panel>
  );
}
