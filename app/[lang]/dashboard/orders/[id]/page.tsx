import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ReceiptText } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { CopyText } from "@/components/app/copy-button";
import { ActionForm, DeleteButton, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { PaymentsPanel } from "@/components/app/payments-panel";
import { DefinitionList, PageHeader, Panel, StatusBadge, TableWrap, formatDate, formatMoney, orderStatusTone, paymentStatusTone, secondaryLink, td, th } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { deleteOrder, linkOrderCustomer, updateOrder } from "@/lib/actions/orders";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getOrder, listCustomerOptions, listOrderNotifications, listOrderPayments, listOrderStatusEvents, localToday } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { CLOSED_ORDER_STATUSES, DELIVERY_METHODS, ORDER_STATUSES, PAYMENT_METHODS } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.orders.title);

/** One order: customer, items and money, payments (record, refund, void), delivery, status and its history. */
export default async function OrderPage({ params, searchParams }: PageProps<"/[lang]/dashboard/orders/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/orders/${id}`));
  const isAdmin = hasRole(business.role, "admin");
  const [order, notifications, payments, events] = isUuid(id)
    ? await Promise.all([getOrder(business.id, id, isAdmin), listOrderNotifications(business.id, id), listOrderPayments(business.id, id), listOrderStatusEvents(business.id, id)])
    : [null, [], [], []];
  if (!order) notFound();
  const d = t.dashboard;
  const o = d.orders;
  const n = d.notifications;
  const x = o.detail;
  const canEdit = hasRole(business.role, "agent");
  const money = (v: number | string) => formatMoney(v, order.currency, locale);
  const closed = (CLOSED_ORDER_STATUSES as readonly string[]).includes(order.status);
  const paid = Number(order.amount_paid);
  const refunded = Number(order.amount_refunded);
  const balance = Number(order.balance_due ?? 0);
  const customer = order.customers;
  // An order without a customer can only be a till sale (walk-in); anything else is shown as not linked.
  const linkable = !customer && isAdmin ? await listCustomerOptions(business.id) : [];
  const statusLabel = (s: string) => o.statuses[s as keyof typeof o.statuses] ?? s;
  const hasPayments = payments.some((p) => !p.voided_at && p.kind === "payment");
  const doc = (type: "invoice" | "receipt") => localizePath(locale, `/dashboard/orders/${order.id}/document?type=${type}`);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={order.order_number}
        description={format(d.common.createdAt, { date: formatDate(order.created_at, locale, true) })}
        back={{ href: localizePath(locale, "/dashboard/orders"), label: o.title }}
        actions={
          <>
            <Link href={doc("invoice")} className={secondaryLink} data-testid="open-invoice">
              <FileText aria-hidden /> {x.invoice}
            </Link>
            {hasPayments ? (
              <Link href={doc("receipt")} className={secondaryLink} data-testid="open-receipt">
                <ReceiptText aria-hidden /> {x.receipt}
              </Link>
            ) : null}
            {isAdmin ? <DeleteButton action={deleteOrder.bind(null, order.id, locale)} labels={d.common} errors={d.errors} /> : null}
          </>
        }
      />
      {sp.saved ? <FormAlert tone="success">{o.saved}</FormAlert> : null}
      {order.status === "returned" ? <FormAlert tone="info">{x.returnedNote}</FormAlert> : order.status === "cancelled" && paid > refunded ? <FormAlert tone="info">{x.cancelledNote}</FormAlert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={o.items}>
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>{o.fields.product}</th>
                  <th className={th}>{o.fields.sku}</th>
                  <th className={`${th} text-right`}>{o.fields.unitPrice}</th>
                  <th className={`${th} text-right`}>{o.fields.quantity}</th>
                  <th className={`${th} text-right`}>{o.totals.total}</th>
                </tr>
              </thead>
              <tbody data-testid="order-items">
                {order.order_items.map((i) => (
                  <tr key={i.id}>
                    <td className={td}>
                      <span className="font-semibold">{i.product_name}</span>
                      {i.variant ? <span className="block text-xs text-slate">{i.variant}</span> : null}
                    </td>
                    <td className={`${td} font-mono text-xs text-slate`}>{i.sku ?? "—"}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>{money(i.unit_price)}</td>
                    <td className={`${td} text-right`}>{i.quantity}</td>
                    <td className={`${td} text-right font-semibold whitespace-nowrap`}>{money(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1.5 text-sm" data-testid="order-totals">
              {[
                [o.totals.subtotal, money(order.subtotal)],
                [o.totals.delivery, money(order.delivery_fee)],
                [o.totals.discount, `−${money(order.discount)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate">{k}</dt>
                  <dd className="text-deep">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-base">
                <dt className="font-semibold text-deep">{o.totals.total}</dt>
                <dd className="font-bold text-deep">{money(order.total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate">{x.paid}</dt>
                <dd className="text-deep">{money(paid)}</dd>
              </div>
              {refunded > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate">{x.refunded}</dt>
                  <dd className="text-deep">−{money(refunded)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 font-semibold">
                <dt className="text-deep">{x.balance}</dt>
                <dd className={balance > 0 ? "text-coral-700" : "text-deep"} data-testid="order-balance-due">
                  {money(balance)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-right text-xs text-slate">{x.tax}</p>
          </Panel>

          <PaymentsPanel
            order={{ id: order.id, total: Number(order.total), paid, refunded, currency: order.currency, closed }}
            payments={payments}
            canRecord={canEdit}
            canManage={isAdmin}
            today={localToday(business.timezone)}
            locale={locale}
            t={d.payments}
            errors={d.errors}
          />

          <Panel title={o.update}>
            <ActionForm action={updateOrder} text={{ errors: d.errors, saved: o.updated, saving: d.common.saving }} disabled={!canEdit} hidden={{ id: order.id }}>
              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField
                  name="status"
                  label={o.fields.status}
                  defaultValue={order.status}
                  options={ORDER_STATUSES.filter((s) => s !== "returned" || order.status === "delivered" || order.status === "returned").map((s) => ({ value: s, label: o.statuses[s] }))}
                />
                <SelectField
                  name="payment_method"
                  label={o.fields.paymentMethod}
                  defaultValue={order.payment_method ?? ""}
                  placeholder={o.fields.noMethod}
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: o.methods[m] }))}
                />
                <SelectField
                  name="delivery_method"
                  label={o.fields.deliveryMethod}
                  defaultValue={order.delivery_method ?? ""}
                  placeholder={o.fields.noDeliveryMethod}
                  options={DELIVERY_METHODS.map((m) => ({ value: m, label: o.fields.deliveryMethods[m] }))}
                />
                <TextField name="delivery_address" label={o.fields.deliveryAddress} defaultValue={order.delivery_address ?? ""} maxLength={500} />
                <TextField name="recipient_name" label={o.fields.recipientName} defaultValue={order.recipient_name ?? ""} maxLength={120} />
                <TextField name="recipient_phone" label={o.fields.recipientPhone} defaultValue={order.recipient_phone ?? ""} maxLength={24} type="tel" />
                <TextField name="pickup_location" label={o.fields.pickupLocation} defaultValue={order.pickup_location ?? ""} maxLength={300} />
                <TextField name="delivery_reference" label={o.fields.deliveryReference} defaultValue={order.delivery_reference ?? ""} maxLength={100} />
                <TextArea name="delivery_notes" label={o.fields.deliveryNotes} defaultValue={order.delivery_notes ?? ""} maxLength={1000} rows={2} className="sm:col-span-2" />
                <TextArea name="notes" label={o.fields.notes} defaultValue={order.notes ?? ""} maxLength={2000} rows={3} className="sm:col-span-2" />
              </div>
              <p className="text-xs text-slate">{o.paymentNote}</p>
              <div>
                <SubmitButton>{d.common.save}</SubmitButton>
              </div>
            </ActionForm>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={o.fields.customer} className="h-fit">
            <div className="flex flex-col gap-4" data-testid="order-customer-panel">
              {customer ? (
                <>
                  <Link href={localizePath(locale, `/dashboard/customers/${customer.id}`)} className="font-semibold text-deep hover:underline">
                    {customer.name || d.customers.unnamed}
                  </Link>
                  <DefinitionList
                    rows={[
                      { label: x.customerRef, value: <CopyText value={customer.reference} label={format(d.customers.copyReference, { reference: customer.reference })} copiedLabel={d.customers.copied} /> },
                      { label: x.phone, value: `+${customer.whatsapp_phone}` },
                      ...(customer.email ? [{ label: x.email, value: customer.email }] : []),
                      ...(customer.city ? [{ label: x.city, value: customer.city }] : []),
                    ]}
                  />
                  <Link href={localizePath(locale, `/dashboard/customers/${customer.id}`)} className="text-sm font-semibold text-waza-700 hover:underline">
                    {x.profile}
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-slate italic" data-testid="order-no-customer">
                    {order.channel === "pos" ? o.walkIn : o.notLinked}
                  </p>
                  {isAdmin && linkable.length ? (
                    <div className="border-t border-border pt-4" data-testid="link-customer">
                      <p className="font-semibold text-deep">{x.link.title}</p>
                      <p className="mb-3 text-xs text-slate">{x.link.text}</p>
                      <ActionForm action={linkOrderCustomer} text={{ errors: d.errors, saved: x.link.saved, saving: d.common.saving }} successMessage={x.link.saved} hidden={{ order_id: order.id }}>
                        <SelectField
                          name="customer_id"
                          label={x.link.choose}
                          defaultValue=""
                          placeholder={o.fields.chooseCustomer}
                          options={linkable.map((c) => ({ value: c.id, label: `${c.name || d.customers.unnamed} · ${c.reference} · +${c.whatsapp_phone}` }))}
                          required
                        />
                        <div>
                          <SubmitButton variant="outline">{x.link.submit}</SubmitButton>
                        </div>
                      </ActionForm>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Panel>

          <Panel title={x.order} className="h-fit">
            <DefinitionList
              rows={[
                { label: o.columns.number, value: <CopyText value={order.order_number} label={order.order_number} copiedLabel={d.customers.copied} /> },
                { label: o.columns.status, value: <StatusBadge tone={orderStatusTone[order.status]}>{statusLabel(order.status)}</StatusBadge> },
                { label: o.columns.payment, value: <StatusBadge tone={paymentStatusTone[order.payment_status]}>{o.payment[order.payment_status as keyof typeof o.payment] ?? order.payment_status}</StatusBadge> },
                { label: o.fields.paymentMethod, value: order.payment_method ? (o.methods[order.payment_method as keyof typeof o.methods] ?? order.payment_method) : o.fields.noMethod },
                { label: x.channel, value: d.sales.detail.channel[order.channel as keyof typeof d.sales.detail.channel] ?? order.channel },
                { label: x.created, value: formatDate(order.created_at, locale, true) },
                { label: x.updated, value: formatDate(order.updated_at, locale, true) },
              ]}
            />
            {order.conversation_id ? (
              <Link href={localizePath(locale, `/dashboard/conversations/${order.conversation_id}`)} className="mt-3 inline-block text-sm font-semibold text-waza-700 hover:underline">
                {o.conversation}
              </Link>
            ) : null}
          </Panel>

          <Panel title={x.delivery} className="h-fit">
            {order.delivery_method || order.delivery_address || order.recipient_name || order.pickup_location || order.delivery_reference || order.delivery_notes ? (
              <DefinitionList
                rows={[
                  { label: o.fields.deliveryMethod, value: order.delivery_method ? o.fields.deliveryMethods[order.delivery_method as keyof typeof o.fields.deliveryMethods] : o.fields.noDeliveryMethod },
                  ...(order.delivery_address ? [{ label: o.fields.deliveryAddress, value: order.delivery_address }] : []),
                  ...(order.recipient_name || order.recipient_phone ? [{ label: o.fields.recipientName, value: [order.recipient_name, order.recipient_phone].filter(Boolean).join(" · ") }] : []),
                  ...(order.pickup_location ? [{ label: o.fields.pickupLocation, value: order.pickup_location }] : []),
                  ...(order.delivery_reference ? [{ label: o.fields.deliveryReference, value: order.delivery_reference }] : []),
                  ...(order.delivery_notes ? [{ label: o.fields.deliveryNotes, value: order.delivery_notes }] : []),
                  { label: o.totals.delivery, value: money(order.delivery_fee) },
                ]}
              />
            ) : (
              <p className="text-sm text-slate">{x.noDelivery}</p>
            )}
          </Panel>

          <Panel title={x.history} className="h-fit">
            {events.length ? (
              <ol className="flex flex-col gap-2 text-sm" data-testid="order-history">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-deep">{e.from_status ? statusLabel(e.to_status) : `${x.historyCreated} (${statusLabel(e.to_status)})`}</span>
                    <span className="text-xs text-slate">
                      {formatDate(e.created_at, locale, true)}
                      {e.by ? ` · ${format(x.historyBy, { name: e.by })}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate">{x.historyEmpty}</p>
            )}
            {notifications.length ? (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold tracking-wider text-slate uppercase">{n.order.title}</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {notifications.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-deep">{n.templates.kinds[row.kind as keyof typeof n.templates.kinds] ?? row.kind}</span>
                      <StatusBadge tone={row.status === "sent" ? "green" : row.status === "failed" ? "red" : "neutral"}>{n.log.status[row.status as keyof typeof n.log.status] ?? row.status}</StatusBadge>
                      {row.status !== "sent" && row.reason ? <span className="text-xs text-slate">{n.log.reasons[row.reason as keyof typeof n.log.reasons] ?? row.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
