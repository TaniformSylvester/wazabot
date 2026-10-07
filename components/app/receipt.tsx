import { formatDate, formatMoney } from "@/components/app/ui";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/messages/en";

export type ReceiptData = {
  business: { name: string; phone: string | null; email: string | null; address: string | null; city: string | null; logoUrl: string | null; footer: string | null };
  number: string;
  date: string;
  customer: string | null;
  staff: string | null;
  items: { name: string; detail: string | null; quantity: number; total: number }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paid: number;
  currency: string;
  method: string | null;
  /** MoMo / bank / other references typed when the payments were recorded. */
  references: string[];
  status: string;
};

/**
 * A till receipt, sized like a thermal roll (~80 mm) on screen and in print.
 * Everything comes from the database: the business, the sale, the payments.
 */
export function Receipt({ r, locale, t, methods, statuses }: { r: ReceiptData; locale: Locale; t: Messages["dashboard"]["sales"]["receipt"]; methods: Record<string, string>; statuses: Record<string, string> }) {
  const money = (v: number) => formatMoney(v, r.currency, locale);
  const due = Math.max(0, r.total - r.paid);
  const rule = <div className="my-2 border-t border-dashed border-deep/40" aria-hidden />;
  return (
    <article aria-label={`${t.number} ${r.number}`} data-testid="receipt" className="receipt mx-auto w-full max-w-[22rem] rounded-2xl border border-border bg-white p-5 font-mono text-[0.8125rem] leading-5 text-deep shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="text-center">
        {r.business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- business logo from Storage
          <img src={r.business.logoUrl} alt="" className="mx-auto mb-2 size-14 rounded-lg object-contain" />
        ) : null}
        <p className="text-base font-bold uppercase">{r.business.name}</p>
        {[r.business.address, r.business.city].filter(Boolean).length ? <p>{[r.business.address, r.business.city].filter(Boolean).join(", ")}</p> : null}
        {r.business.phone ? <p>{r.business.phone}</p> : null}
        {r.business.email ? <p>{r.business.email}</p> : null}
      </header>
      {rule}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt>{t.number}</dt>
        <dd className="text-right font-bold">{r.number}</dd>
        <dt>{t.date}</dt>
        <dd className="text-right">{formatDate(r.date, locale, true)}</dd>
        {r.customer ? (
          <>
            <dt>{t.customer}</dt>
            <dd className="text-right">{r.customer}</dd>
          </>
        ) : null}
        {r.staff ? (
          <>
            <dt>{t.servedBy}</dt>
            <dd className="text-right">{r.staff}</dd>
          </>
        ) : null}
      </dl>
      {rule}
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="font-bold">{t.product}</th>
            <th className="px-2 text-right font-bold">{t.qty}</th>
            <th className="text-right font-bold">{t.amount}</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((i, k) => (
            <tr key={k} className="align-top">
              <td className="py-0.5 pr-2">
                {i.name}
                {i.detail ? <span className="block text-[0.75rem] opacity-70">{i.detail}</span> : null}
              </td>
              <td className="px-2 py-0.5 text-right">{i.quantity}</td>
              <td className="py-0.5 text-right whitespace-nowrap">{money(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rule}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3">
        <dt>{t.subtotal}</dt>
        <dd className="text-right">{money(r.subtotal)}</dd>
        {r.discount > 0 ? (
          <>
            <dt>{t.discount}</dt>
            <dd className="text-right">−{money(r.discount)}</dd>
          </>
        ) : null}
        <dt className="mt-1 text-base font-bold">{t.total}</dt>
        <dd className="mt-1 text-right text-base font-bold">{money(r.total)}</dd>
      </dl>
      {rule}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3">
        <dt>{t.payment}</dt>
        <dd className="text-right">{r.method ? (methods[r.method] ?? r.method) : "—"}</dd>
        {r.references.length ? (
          <>
            <dt>{t.reference}</dt>
            <dd className="text-right break-all">{r.references.join(", ")}</dd>
          </>
        ) : null}
        <dt>{t.paid}</dt>
        <dd className="text-right">{money(r.paid)}</dd>
        {due > 0 ? (
          <>
            <dt className="font-bold">{t.balance}</dt>
            <dd className="text-right font-bold">{money(due)}</dd>
          </>
        ) : null}
        <dt>{t.status}</dt>
        <dd className="text-right font-bold uppercase">{statuses[r.status] ?? r.status}</dd>
      </dl>
      {rule}
      <footer className="text-center">
        <p>{r.business.footer || t.thanks}</p>
        <p className="mt-1 text-[0.75rem] opacity-70">{t.powered}</p>
      </footer>
    </article>
  );
}
