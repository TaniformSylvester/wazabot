import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Printer } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { PaymentsPanel } from "@/components/app/payments-panel";
import { PageHeader, Panel, StatusBadge, formatDate, formatMoney, secondaryLink, type BadgeTone } from "@/components/app/ui";
import { MenuPicker } from "@/components/restaurant/menu-picker";
import { addDishes, closeBill, removeDish, sendToKitchen } from "@/lib/actions/restaurant";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { receiptsForPayments } from "@/lib/data/documents";
import { listOrderPayments, localToday } from "@/lib/data/queries";
import { getRestaurantOrder, listMenu, type BillLine } from "@/lib/data/restaurant";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { extrasLabel } from "@/lib/restaurant/extras";

export const generateMetadata = dashboardMetadata((d) => d.restaurant.floor.title);

const TICKET_TONE: Record<string, BadgeTone> = { new: "amber", preparing: "amber", ready: "green", served: "neutral", cancelled: "red" };

/**
 * A restaurant order: an open bill on a table, or a takeaway/delivery order.
 * Its dishes by kitchen round, more dishes from the menu, payments (several
 * allowed), the printable bill, and closing once paid in full.
 */
export default async function RestaurantOrderPage({ params }: PageProps<"/[lang]/dashboard/restaurant/orders/[id]">) {
  const [locale, t, { id }] = await Promise.all([getLocale(), getMessages(), params]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/restaurant/orders/${id}`));
  const order = isUuid(id) ? await getRestaurantOrder(business.id, id) : null;
  if (!order) notFound();
  const d = t.dashboard;
  const r = d.restaurant;
  const b = r.bill;
  const canOrder = hasRole(business.role, "agent");
  const isAdmin = hasRole(business.role, "admin");
  const money = (v: number) => formatMoney(v, order.currency, locale);
  const [menu, payments] = await Promise.all([order.open && canOrder ? listMenu(business.id) : Promise.resolve([]), listOrderPayments(business.id, order.id)]);
  const receipts = await receiptsForPayments(business.id, "order", payments.map((p) => p.id));
  const title = order.tableName ? format(b.table, { name: order.tableName }) : r.serviceTypes[order.service_type];
  const text = { errors: d.errors, saved: d.common.saved, saving: d.common.saving };

  const Line = ({ line, removable }: { line: BillLine; removable: boolean }) => (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="font-semibold text-deep">
            {line.quantity} × {line.product_name}
          </span>
          {line.variant ? <span className="block text-xs text-slate">{line.variant}</span> : null}
          {line.extras.length ? <span className="block text-xs text-slate">{format(b.extras, { extras: extrasLabel(line.extras) })}</span> : null}
          {line.note ? <span className="block text-xs text-slate italic">“{line.note}”</span> : null}
        </span>
        <span className="shrink-0 font-semibold whitespace-nowrap">{money(line.total)}</span>
      </div>
      {removable ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-coral-700">{b.remove}</summary>
          <ActionForm action={removeDish.bind(null, line.id)} text={{ ...text, saved: b.removed }} successMessage={b.removed} className="mt-2 gap-2 sm:flex-row sm:items-end">
            <TextField name="reason" label={b.removeReason} required minLength={3} maxLength={300} className="sm:w-72" />
            <div>
              <SubmitButton variant="outline">{b.removeSubmit}</SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
    </li>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={`${title} · ${order.order_number}`}
        description={[
          r.serviceTypes[order.service_type],
          order.guests ? format(b.guests, { count: order.guests }) : null,
          order.customers?.name ?? null,
          formatDate(order.created_at, locale, true),
        ]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: localizePath(locale, "/dashboard/restaurant"), label: r.floor.title }}
        actions={
          <>
            <Link href={localizePath(locale, `/dashboard/orders/${order.id}/document?type=invoice`)} className={secondaryLink} data-testid="print-bill">
              <Printer aria-hidden /> {b.printBill}
            </Link>
            <Link href={localizePath(locale, `/dashboard/orders/${order.id}`)} className={secondaryLink}>
              <FileText aria-hidden /> {b.order}
            </Link>
          </>
        }
      />
      {order.bill_closed_at ? <FormAlert tone="success">{format(b.closed, { date: formatDate(order.bill_closed_at, locale, true) })}</FormAlert> : null}
      {order.channel === "whatsapp" && order.status === "pending" ? <FormAlert tone="info">{r.floor.fromWhatsApp}</FormAlert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={b.rounds}>
            {order.lineCount ? (
              <div className="flex flex-col gap-4" data-testid="bill-rounds">
                {order.tickets.map((ticket) => (
                  <section key={ticket.id} className="rounded-2xl border border-border p-4" data-testid="bill-round">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-deep">{format(b.round, { n: ticket.seq })}</p>
                      <StatusBadge tone={TICKET_TONE[ticket.status] ?? "neutral"}>{r.ticketStatuses[ticket.status]}</StatusBadge>
                    </div>
                    <ul className="divide-y divide-border">
                      {ticket.lines.map((line) => (
                        <Line key={line.id} line={line} removable={order.open && (ticket.status === "new" ? canOrder : isAdmin)} />
                      ))}
                    </ul>
                  </section>
                ))}
                {order.unsent.length ? (
                  <section className="rounded-2xl border border-dashed border-gold-200 bg-gold-50 p-4" data-testid="bill-unsent">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-deep">{b.notSent}</p>
                      {order.open && canOrder ? (
                        <ActionButton action={sendToKitchen.bind(null, order.id)} errors={d.errors} variant="default">
                          {b.sendToKitchen}
                        </ActionButton>
                      ) : null}
                    </div>
                    <ul className="divide-y divide-border">
                      {order.unsent.map((line) => (
                        <Line key={line.id} line={line} removable={order.open && canOrder} />
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate">{b.empty}</p>
            )}
          </Panel>

          {order.open && canOrder ? (
            <Panel title={b.addDishes}>
              <ActionForm action={addDishes.bind(null, order.id)} text={{ ...text, saved: b.sentToKitchen }} successMessage={b.sentToKitchen}>
                <MenuPicker menu={menu} currency={order.currency} locale={locale} t={r.menu} />
                <div>
                  <SubmitButton>{r.menu.submit}</SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Panel>
            <dl className="flex flex-col gap-1.5 text-sm" data-testid="bill-totals">
              {[
                [d.orders.totals.subtotal, money(order.subtotal)],
                ...(order.delivery_fee ? [[d.orders.totals.delivery, money(order.delivery_fee)]] : []),
                ...(order.discount ? [[d.orders.totals.discount, `−${money(order.discount)}`]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate">{k}</dt>
                  <dd className="text-deep">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-base">
                <dt className="font-semibold text-deep">{d.orders.totals.total}</dt>
                <dd className="font-bold text-deep" data-testid="bill-total">
                  {money(order.total)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 font-semibold">
                <dt className="text-deep">{d.orders.detail.balance}</dt>
                <dd className={order.balance_due > 0 ? "text-coral-700" : "text-deep"} data-testid="bill-balance">
                  {money(order.balance_due)}
                </dd>
              </div>
            </dl>
            {order.open && canOrder ? (
              <div className="mt-4 flex flex-col gap-1">
                <ActionButton action={closeBill.bind(null, order.id)} errors={d.errors} variant="dark">
                  {b.close}
                </ActionButton>
                <p className="text-xs text-slate">{b.closeHint}</p>
              </div>
            ) : null}
          </Panel>
          <PaymentsPanel
            order={{ id: order.id, total: order.total, paid: order.amount_paid, refunded: order.amount_refunded, currency: order.currency, closed: ["cancelled", "returned"].includes(order.status) }}
            payments={payments}
            canRecord={canOrder}
            canManage={isAdmin}
            today={localToday(business.timezone)}
            locale={locale}
            t={d.payments}
            errors={d.errors}
            receipts={receipts}
          />
        </div>
      </div>
    </div>
  );
}
