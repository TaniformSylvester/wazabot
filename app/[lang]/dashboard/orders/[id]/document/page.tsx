import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { PrintButton } from "@/components/app/print-button";
import { PageHeader, formatDate, formatMoney, secondaryLink } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { requireBusiness } from "@/lib/auth/dal";
import { getOrder, listOrderPayments } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.orders.documents.invoice);

/**
 * A printable invoice (payment requested) or payment receipt (payments
 * recorded in WazaBolt) for one order. "Save as PDF" in the print dialog
 * gives a PDF. Everything comes from the order as recorded: item prices at
 * the time of the order, valid payments and refunds only.
 * Numbers follow the order's: ORD-00067 → INV-00067 / RCT-00067.
 */
export default async function OrderDocumentPage({ params, searchParams }: PageProps<"/[lang]/dashboard/orders/[id]/document">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/orders/${id}`));
  const [order, payments] = isUuid(id) ? await Promise.all([getOrder(business.id, id), listOrderPayments(business.id, id)]) : [null, []];
  if (!order) notFound();
  const type = sp.type === "receipt" ? "receipt" : "invoice";
  const d = t.dashboard;
  const o = d.orders;
  const doc = o.documents;
  const money = (v: number | string) => formatMoney(v, order.currency, locale);
  const valid = payments.filter((p) => !p.voided_at);
  const received = valid.filter((p) => p.kind === "payment");
  const paid = Number(order.amount_paid);
  const refunded = Number(order.amount_refunded);
  const balance = Number(order.balance_due ?? 0);
  const number = `${type === "invoice" ? "INV" : "RCT"}-${order.order_number.replace(/^ORD-/, "")}`;
  const customer = order.customers;
  const back = localizePath(locale, `/dashboard/orders/${order.id}`);
  const methods = d.payments.methods;
  const row = "flex justify-between gap-6 py-1";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="print:hidden">
        <PageHeader title={`${type === "invoice" ? doc.invoice : doc.receipt} ${number}`} back={{ href: back, label: doc.back }} actions={<PrintButton label={doc.print} className={secondaryLink} />} />
      </div>

      {type === "receipt" && !received.length ? (
        <FormAlert tone="info">{doc.noPayments}</FormAlert>
      ) : (
        <article className="rounded-3xl border border-border bg-white p-4 text-sm text-deep shadow-card sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid={`document-${type}`}>
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
            <div className="flex items-start gap-3">
              {business.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- business logo from Storage
                <img src={business.logoUrl} alt="" className="size-14 rounded-lg object-contain" />
              ) : null}
              <div>
                <p className="text-lg font-bold">{business.name}</p>
                {[business.address, business.city].filter(Boolean).length ? <p>{[business.address, business.city].filter(Boolean).join(", ")}</p> : null}
                {business.phone ? <p>{business.phone}</p> : null}
                {business.email ? <p>{business.email}</p> : null}
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold tracking-wide uppercase">{type === "invoice" ? doc.invoice : doc.receipt}</p>
              <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
                <dt className="text-slate">{doc.number}</dt>
                <dd className="font-semibold" data-testid="document-number">
                  {number}
                </dd>
                <dt className="text-slate">{doc.order}</dt>
                <dd>{order.order_number}</dd>
                <dt className="text-slate">{doc.issued}</dt>
                <dd>{formatDate(new Date().toISOString(), locale)}</dd>
                <dt className="text-slate">{doc.orderDate}</dt>
                <dd>{formatDate(order.created_at, locale)}</dd>
              </dl>
            </div>
          </header>

          <section className="border-b border-border py-5">
            <p className="text-xs font-semibold tracking-wider text-slate uppercase">{doc.billTo}</p>
            {customer ? (
              <div className="mt-1">
                <p className="font-semibold">
                  {customer.name || d.customers.unnamed} <span className="font-mono text-xs text-slate">({customer.reference})</span>
                </p>
                <p>+{customer.whatsapp_phone}</p>
                {customer.email ? <p>{customer.email}</p> : null}
                {customer.city ? <p>{customer.city}</p> : null}
              </div>
            ) : (
              <p className="mt-1">{order.channel === "pos" ? o.walkIn : o.notLinked}</p>
            )}
            {order.delivery_address ? (
              <p className="mt-2 text-slate">
                {o.fields.deliveryAddress}: {order.delivery_address}
              </p>
            ) : null}
          </section>

          <table className="mt-5 w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs tracking-wider text-slate uppercase">
                <th className="py-2 pr-1.5 font-semibold sm:pr-3">{o.fields.product}</th>
                <th className="px-1.5 py-2 text-right font-semibold sm:px-3">{o.fields.quantity}</th>
                <th className="px-1.5 py-2 text-right font-semibold sm:px-3">{doc.unitPrice}</th>
                <th className="py-2 pl-1.5 text-right font-semibold sm:pl-3">{doc.total}</th>
              </tr>
            </thead>
            <tbody data-testid="document-items">
              {order.order_items.map((i) => (
                <tr key={i.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-1.5 sm:pr-3">
                    {i.product_name}
                    {i.variant || i.sku ? <span className="block text-xs text-slate">{[i.variant, i.sku].filter(Boolean).join(" · ")}</span> : null}
                  </td>
                  <td className="px-1.5 py-2 text-right sm:px-3">{i.quantity}</td>
                  <td className="px-1.5 py-2 text-right sm:px-3 sm:whitespace-nowrap">{money(i.unit_price)}</td>
                  <td className="py-2 pl-1.5 text-right sm:pl-3 sm:whitespace-nowrap">{money(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 ml-auto max-w-xs" data-testid="document-totals">
            <div className={row}>
              <span className="text-slate">{doc.subtotal}</span>
              <span>{money(order.subtotal)}</span>
            </div>
            {Number(order.delivery_fee) > 0 ? (
              <div className={row}>
                <span className="text-slate">{doc.delivery}</span>
                <span>{money(order.delivery_fee)}</span>
              </div>
            ) : null}
            {Number(order.discount) > 0 ? (
              <div className={row}>
                <span className="text-slate">{doc.discount}</span>
                <span>−{money(order.discount)}</span>
              </div>
            ) : null}
            <div className={`${row} border-t border-border pt-2 text-base font-bold`}>
              <span>{doc.total}</span>
              <span>{money(order.total)}</span>
            </div>
            <div className={row}>
              <span className="text-slate">{doc.paid}</span>
              <span>{money(paid)}</span>
            </div>
            {refunded > 0 ? (
              <div className={row}>
                <span className="text-slate">{doc.refunded}</span>
                <span>−{money(refunded)}</span>
              </div>
            ) : null}
            <div className={`${row} font-semibold`}>
              <span>{doc.balance}</span>
              <span data-testid="document-balance">{money(balance)}</span>
            </div>
            <div className={row}>
              <span className="text-slate">{doc.status}</span>
              <span className="font-semibold uppercase">{o.payment[order.payment_status as keyof typeof o.payment] ?? order.payment_status}</span>
            </div>
          </div>

          {type === "receipt" ? (
            <section className="mt-6 border-t border-border pt-5">
              <p className="mb-2 text-xs font-semibold tracking-wider text-slate uppercase">{doc.payments}</p>
              <ul className="flex flex-col gap-1" data-testid="document-payments">
                {valid.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-x-6">
                    <span>
                      {formatDate(p.received_at, locale)} · {d.payments.kinds[p.kind as keyof typeof d.payments.kinds] ?? p.kind} · {methods[p.method as keyof typeof methods] ?? p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span className="font-semibold">
                      {p.kind === "refund" ? "−" : ""}
                      {money(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className="mt-8 border-t border-border pt-4 text-xs text-slate">
            <p>{type === "invoice" ? doc.invoiceNote : doc.receiptNote}</p>
            <p className="mt-1">{doc.generated}</p>
          </footer>
        </article>
      )}
    </div>
  );
}
