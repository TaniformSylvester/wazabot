import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CalendarPlus, CircleDollarSign, HandCoins, MessagesSquare, Plus, ShoppingBag, ShoppingCart, Wallet } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, DeleteButton } from "@/components/app/form";
import { CopyText } from "@/components/app/copy-button";
import { CustomerForm } from "@/components/app/customer-form";
import { PaymentForm } from "@/components/app/payment-form";
import {
  DefinitionList,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
  conversationStatusTone,
  formatDate,
  formatMoney,
  orderStatusTone,
  paymentStatusTone,
  secondaryLink,
} from "@/components/app/ui";
import { startConversation } from "@/lib/actions/conversations";
import { deleteCustomer } from "@/lib/actions/customers";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getBookingSetup, getCustomer, localToday } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { isLanguageCode, languageName } from "@/lib/i18n/languages";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.customers.title);

export default async function CustomerPage({ params, searchParams }: PageProps<"/[lang]/dashboard/customers/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/customers/${id}`));
  const [data, booking] = await Promise.all([isUuid(id) ? getCustomer(business.id, id) : null, getBookingSetup(business.id)]);
  const bookingOpen = Boolean(booking.settings?.enabled) && booking.services.some((s) => s.active);
  if (!data) notFound();
  const { customer, conversations, orders, stats, payments, duplicates } = data;
  const d = t.dashboard;
  const c = d.customers;
  const canEdit = hasRole(business.role, "agent");
  const canDelete = hasRole(business.role, "admin");
  const href = (p: string) => localizePath(locale, p);
  const lang = isLanguageCode(customer.preferred_language) ? languageName(customer.preferred_language, locale) : c.fields.languageAuto;
  const source = customer.preferred_language_source as keyof typeof c.profile.languageSource | null;
  const money = (v: number | string) => formatMoney(v, business.currency, locale);
  const methodLabel = (m: string) => d.payments.methods[m as keyof typeof d.payments.methods] ?? m;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={customer.name || c.unnamed}
        description={`${customer.reference} · +${customer.whatsapp_phone}`}
        back={{ href: href("/dashboard/customers"), label: c.title }}
        actions={
          canEdit ? (
            <>
              <Link href={href(`/dashboard/sales/new?customer=${customer.id}`)} className={secondaryLink}>
                <ShoppingCart aria-hidden /> {c.profile.newSale}
              </Link>
              <ActionButton action={startConversation.bind(null, customer.id, locale)} errors={d.errors} variant="dark" size="default">
                <MessagesSquare aria-hidden /> {c.profile.startConversation}
              </ActionButton>
              <Link href={href(`/dashboard/orders/new?customer=${customer.id}`)} className={secondaryLink}>
                <Plus aria-hidden /> {c.profile.newOrder}
              </Link>
              {bookingOpen ? (
                <Link href={href(`/dashboard/appointments/new?customer=${customer.id}`)} className={secondaryLink}>
                  <CalendarPlus aria-hidden /> {d.appointments.new}
                </Link>
              ) : null}
            </>
          ) : null
        }
      />
      {sp.saved ? (
        <FormAlert tone="success">
          <span data-testid="customer-created">{format(c.created, { reference: customer.reference })}</span>
        </FormAlert>
      ) : null}
      {duplicates.length ? (
        <FormAlert tone="info">
          <span data-testid="possible-duplicates">
            <strong>{c.profile.possibleDuplicates}:</strong>{" "}
            {duplicates.map((x, i) => (
              <span key={x.id}>
                {i ? ", " : ""}
                <Link href={href(`/dashboard/customers/${x.id}`)} className="font-semibold underline">
                  {x.name || c.unnamed} ({x.reference}, +{x.whatsapp_phone})
                </Link>
              </span>
            ))}
            . {c.profile.possibleDuplicatesText}
          </span>
        </FormAlert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={c.summary.spent} value={money(stats.total_spent)} icon={CircleDollarSign} hint={`${c.summary.orders}: ${formatNumber(stats.orders_count, locale)}`} noData={c.summary.none} />
        <StatCard label={c.summary.paid} value={money(stats.amount_paid)} icon={Wallet} hint={c.summary.paidHint} noData={c.summary.none} />
        <div data-testid="customer-outstanding">
          <StatCard label={c.summary.outstanding} value={money(stats.outstanding)} icon={HandCoins} noData={c.summary.none} />
        </div>
        <StatCard
          label={c.summary.lastPurchase}
          value={stats.last_purchase_at ? formatDate(stats.last_purchase_at, locale) : null}
          icon={CalendarClock}
          hint={`${c.summary.since} ${formatDate(customer.created_at, locale)}`}
          noData={c.summary.none}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {!canEdit ? <FormAlert tone="info">{d.common.readOnly}</FormAlert> : null}
          {canEdit ? (
            <Panel title={c.credit.title} description={stats.outstanding > 0 ? c.credit.text : undefined}>
              {stats.outstanding > 0 ? (
                <PaymentForm target={{ customerId: customer.id }} balance={stats.outstanding} currency={business.currency} t={d.payments} errors={d.errors} today={localToday(business.timezone)} />
              ) : (
                <p className="text-sm text-slate">{c.credit.clear}</p>
              )}
            </Panel>
          ) : null}
          <Panel
            title={c.history.purchases}
            actions={
              orders.length ? (
                <Link href={href(`/dashboard/orders?customer=${customer.id}`)} className="text-sm font-semibold text-waza-700 hover:underline">
                  {c.history.allOrders}
                </Link>
              ) : null
            }
          >
            {orders.length ? (
              <ul className="divide-y divide-border" data-testid="customer-purchases">
                {orders.map((o) => {
                  const owes = o.status === "cancelled" ? 0 : Number(o.total) - Number(o.amount_paid);
                  const sale = o.status === "delivered";
                  return (
                    <li key={o.id}>
                      <Link href={href(sale ? `/dashboard/sales/${o.id}` : `/dashboard/orders/${o.id}`)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:underline">
                        <ShoppingBag className="size-4 shrink-0 text-slate" aria-hidden />
                        <span className="font-semibold">{o.order_number}</span>
                        <span className="text-slate">{formatDate(o.created_at, locale)}</span>
                        <span className="ml-auto whitespace-nowrap font-semibold">{money(o.total)}</span>
                        {owes > 0 ? (
                          <span className="whitespace-nowrap text-gold-800">
                            {c.history.balance} {money(owes)}
                          </span>
                        ) : null}
                        {sale ? (
                          <StatusBadge tone={paymentStatusTone[o.payment_status]}>{d.orders.payment[o.payment_status as keyof typeof d.orders.payment] ?? o.payment_status}</StatusBadge>
                        ) : (
                          <StatusBadge tone={orderStatusTone[o.status]}>{d.orders.statuses[o.status as keyof typeof d.orders.statuses] ?? o.status}</StatusBadge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate">{c.history.noPurchases}</p>
            )}
          </Panel>
          <Panel title={c.history.payments}>
            {payments.length ? (
              <ul className="divide-y divide-border" data-testid="customer-payments">
                {payments.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm ${p.voided_at ? "text-slate" : ""}`}>
                    <span className={`font-semibold whitespace-nowrap ${p.voided_at ? "line-through" : ""}`}>
                      {p.kind === "refund" ? "−" : ""}
                      {money(p.amount)}
                    </span>
                    {p.kind === "refund" ? <StatusBadge>{c.history.refund}</StatusBadge> : null}
                    {p.voided_at ? <StatusBadge tone="red">{c.history.voided}</StatusBadge> : null}
                    <span>{methodLabel(p.method)}</span>
                    {p.reference ? <span className="text-slate">{p.reference}</span> : null}
                    <span className="ml-auto whitespace-nowrap text-slate">
                      {formatDate(p.received_at, locale, true)}
                      {p.by ? ` · ${p.by}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate">{c.history.noPayments}</p>
            )}
          </Panel>
          <CustomerForm t={c} text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }} customer={customer} locale={locale} canEdit={canEdit} submitLabel={d.common.save} />
          {canDelete ? (
            <div>
              <DeleteButton
                action={deleteCustomer.bind(null, customer.id, locale)}
                labels={d.common}
                errors={{ ...d.errors, invalid: c.deleteBlocked }}
                note={orders.length ? c.deleteBlocked : undefined}
              />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={c.profile.details}>
            <DefinitionList
              rows={[
                { label: c.profile.reference, value: <CopyText value={customer.reference} label={format(c.copyReference, { reference: customer.reference })} copiedLabel={c.copied} /> },
                { label: c.fields.phone, value: `+${customer.whatsapp_phone}` },
                ...(customer.email ? [{ label: c.fields.email, value: customer.email }] : []),
                ...(customer.city ? [{ label: c.fields.city, value: customer.city }] : []),
                { label: c.fields.language, value: source && c.profile.languageSource[source] ? `${lang} (${c.profile.languageSource[source]})` : lang },
                { label: c.profile.firstContact, value: customer.first_contact_at ? formatDate(customer.first_contact_at, locale, true) : c.never },
                { label: c.profile.lastContact, value: customer.last_contact_at ? formatDate(customer.last_contact_at, locale, true) : c.never },
              ]}
            />
          </Panel>
          <Panel title={c.profile.conversations}>
            {conversations.length ? (
              <ul className="divide-y divide-border">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <Link href={href(`/dashboard/conversations/${conv.id}`)} className="flex items-center gap-2 py-2.5 text-sm hover:underline">
                      <MessagesSquare className="size-4 shrink-0 text-slate" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{formatDate(conv.last_message_at ?? conv.created_at, locale, true)}</span>
                      <StatusBadge tone={conversationStatusTone[conv.status]}>{d.conversations.statuses[conv.status as keyof typeof d.conversations.statuses] ?? conv.status}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate">{c.profile.noConversations}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
