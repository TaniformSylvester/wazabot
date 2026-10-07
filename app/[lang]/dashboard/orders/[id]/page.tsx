import Link from "next/link";
import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionForm, DeleteButton, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { PaymentsPanel } from "@/components/app/payments-panel";
import { DefinitionList, PageHeader, Panel, StatusBadge, TableWrap, formatDate, formatMoney, orderStatusTone, paymentStatusTone, td, th } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { deleteOrder, updateOrder } from "@/lib/actions/orders";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getOrder, listOrderNotifications, listOrderPayments } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.orders.title);

export default async function OrderPage({ params, searchParams }: PageProps<"/[lang]/dashboard/orders/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/orders/${id}`));
  const [order, notifications, payments] = isUuid(id)
    ? await Promise.all([getOrder(business.id, id, hasRole(business.role, "admin")), listOrderNotifications(business.id, id), listOrderPayments(business.id, id)])
    : [null, [], []];
  if (!order) notFound();
  const d = t.dashboard;
  const o = d.orders;
  const n = d.notifications;
  const canEdit = hasRole(business.role, "agent");
  const canDelete = hasRole(business.role, "admin");
  const money = (v: number | string) => formatMoney(v, order.currency, locale);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={order.order_number}
        description={format(d.common.createdAt, { date: formatDate(order.created_at, locale, true) })}
        back={{ href: localizePath(locale, "/dashboard/orders"), label: o.title }}
        actions={canDelete ? <DeleteButton action={deleteOrder.bind(null, order.id, locale)} labels={d.common} errors={d.errors} /> : null}
      />
      {sp.saved ? <FormAlert tone="success">{o.saved}</FormAlert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={o.items}>
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>{o.fields.product}</th>
                  <th className={`${th} text-right`}>{o.fields.unitPrice}</th>
                  <th className={`${th} text-right`}>{o.fields.quantity}</th>
                  <th className={`${th} text-right`}>{o.totals.total}</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((i) => (
                  <tr key={i.id}>
                    <td className={td}>
                      <span className="font-semibold">{i.product_name}</span>
                      {i.variant ? <span className="block text-xs text-slate">{i.variant}</span> : null}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>{money(i.unit_price)}</td>
                    <td className={`${td} text-right`}>{i.quantity}</td>
                    <td className={`${td} text-right font-semibold whitespace-nowrap`}>{money(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1.5 text-sm">
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
            </dl>
          </Panel>

          <PaymentsPanel
            order={{ id: order.id, total: Number(order.total), paid: Number(order.amount_paid), currency: order.currency, cancelled: order.status === "cancelled" }}
            payments={payments}
            canRecord={canEdit}
            locale={locale}
            t={d.payments}
            errors={d.errors}
          />

          <Panel title={o.update}>
            <ActionForm action={updateOrder} text={{ errors: d.errors, saved: o.updated, saving: d.common.saving }} disabled={!canEdit} hidden={{ id: order.id }}>
              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField name="status" label={o.fields.status} defaultValue={order.status} options={ORDER_STATUSES.map((s) => ({ value: s, label: o.statuses[s] }))} />
                <SelectField
                  name="payment_method"
                  label={o.fields.paymentMethod}
                  defaultValue={order.payment_method ?? ""}
                  placeholder={o.fields.noMethod}
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: o.methods[m] }))}
                />
                <TextField name="delivery_address" label={o.fields.deliveryAddress} defaultValue={order.delivery_address ?? ""} maxLength={500} />
                <TextArea name="notes" label={o.fields.notes} defaultValue={order.notes ?? ""} maxLength={2000} rows={3} className="sm:col-span-2" />
              </div>
              <p className="text-xs text-slate">{o.paymentNote}</p>
              <div>
                <SubmitButton>{d.common.save}</SubmitButton>
              </div>
            </ActionForm>
          </Panel>
        </div>

        <Panel title={o.fields.customer} className="h-fit">
          <div className="flex flex-col gap-4">
            {order.customers ? (
              <Link href={localizePath(locale, `/dashboard/customers/${order.customers.id}`)} className="font-semibold text-deep hover:underline">
                {order.customers.name || `+${order.customers.whatsapp_phone}`}
              </Link>
            ) : null}
            <DefinitionList
              rows={[
                { label: o.columns.status, value: <StatusBadge tone={orderStatusTone[order.status]}>{o.statuses[order.status as keyof typeof o.statuses] ?? order.status}</StatusBadge> },
                { label: o.columns.payment, value: <StatusBadge tone={paymentStatusTone[order.payment_status]}>{o.payment[order.payment_status as keyof typeof o.payment] ?? order.payment_status}</StatusBadge> },
                { label: o.fields.paymentMethod, value: order.payment_method ? (o.methods[order.payment_method as keyof typeof o.methods] ?? order.payment_method) : o.fields.noMethod },
                { label: o.fields.deliveryAddress, value: order.delivery_address ?? "—" },
              ]}
            />
            {order.conversation_id ? (
              <Link href={localizePath(locale, `/dashboard/conversations/${order.conversation_id}`)} className="text-sm font-semibold text-waza-700 hover:underline">
                {o.conversation}
              </Link>
            ) : null}
            {notifications.length ? (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">{n.order.title}</p>
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
          </div>
        </Panel>
      </div>
    </div>
  );
}
