import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { PaymentsPanel } from "@/components/app/payments-panel";
import { PrintButton } from "@/components/app/print-button";
import { Receipt } from "@/components/app/receipt";
import { DefinitionList, PageHeader, Panel, StatusBadge, buttonLink, formatMoney, paymentStatusTone, secondaryLink } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getSale } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.sales.title);

/** One sale: the receipt (printable), payments and, for owners/admins, the estimated profit. */
export default async function SalePage({ params, searchParams }: PageProps<"/[lang]/dashboard/sales/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/sales/${id}`));
  const sale = isUuid(id) ? await getSale(business.id, id, hasRole(business.role, "admin")) : null;
  if (!sale) notFound();
  const { order, payments, staff } = sale;
  const db = await createClient();
  const { data: biz } = await db.from("businesses").select("receipt_footer").eq("id", business.id).maybeSingle();
  const d = t.dashboard;
  const s = d.sales;
  const money = (v: number) => formatMoney(v, order.currency, locale);
  const isAdmin = hasRole(business.role, "admin");
  const costKnown = order.order_items.every((i) => i.unit_cost !== null);
  const cogs = order.order_items.reduce((n, i) => n + i.quantity * Number(i.unit_cost ?? 0), 0);
  const customerName = order.customers ? order.customers.name || `+${order.customers.whatsapp_phone}` : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title={order.order_number}
          back={{ href: localizePath(locale, "/dashboard/sales"), label: s.title }}
          actions={
            <>
              <PrintButton label={s.detail.printReceipt} className={secondaryLink} />
              {hasRole(business.role, "agent") ? (
                <Link href={localizePath(locale, "/dashboard/sales/new")} className={buttonLink}>
                  <Plus aria-hidden /> {s.detail.another}
                </Link>
              ) : null}
            </>
          }
        />
      </div>
      {sp.new ? (
        <div className="print:hidden">
          <FormAlert tone="success">{s.detail.completed}</FormAlert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Receipt
          r={{
            business: { name: business.name, phone: business.phone, email: business.email, address: business.address, city: business.city, logoUrl: business.logoUrl, footer: biz?.receipt_footer ?? null },
            number: order.order_number,
            date: order.created_at,
            customer: customerName,
            staff,
            items: order.order_items.map((i) => ({ name: i.product_name, detail: i.variant, quantity: i.quantity, total: Number(i.total) })),
            subtotal: Number(order.subtotal),
            discount: Number(order.discount),
            deliveryFee: Number(order.delivery_fee),
            total: Number(order.total),
            paid: Number(order.amount_paid),
            currency: order.currency,
            method: order.payment_method,
            references: [...new Set(payments.map((p) => p.reference).filter((x): x is string => !!x))],
            status: order.payment_status,
          }}
          locale={locale}
          t={s.receipt}
          methods={d.payments.methods}
          statuses={d.orders.payment}
        />

        <div className="flex min-w-0 flex-col gap-6 print:hidden">
          <Panel title={d.orders.fields.customer}>
            <DefinitionList
              rows={[
                {
                  label: d.orders.fields.customer,
                  value: order.customers ? (
                    <Link href={localizePath(locale, `/dashboard/customers/${order.customers.id}`)} className="font-semibold text-waza-700 hover:underline">
                      {customerName}
                    </Link>
                  ) : (
                    s.walkIn
                  ),
                },
                { label: s.detail.soldBy, value: staff ?? "—" },
                { label: s.columns.status, value: <StatusBadge tone={paymentStatusTone[order.payment_status]}>{d.orders.payment[order.payment_status as keyof typeof d.orders.payment] ?? order.payment_status}</StatusBadge> },
                { label: s.detail.channelLabel, value: s.detail.channel[order.channel as keyof typeof s.detail.channel] ?? order.channel },
              ]}
            />
          </Panel>

          {isAdmin ? (
            <Panel title={s.detail.profit} description={s.detail.profitNote}>
              {costKnown ? (
                <DefinitionList
                  rows={[
                    { label: d.orders.totals.total, value: money(Number(order.total)) },
                    { label: s.detail.cogs, value: money(cogs) },
                    { label: s.detail.profit, value: <span className="font-bold text-deep" data-testid="sale-profit">{money(Number(order.total) - cogs)}</span> },
                  ]}
                />
              ) : (
                <p className="text-sm text-slate">{s.detail.profitUnknown}</p>
              )}
            </Panel>
          ) : null}

          <PaymentsPanel
            order={{ id: order.id, total: Number(order.total), paid: Number(order.amount_paid), currency: order.currency, cancelled: order.status === "cancelled" }}
            payments={payments}
            canRecord={hasRole(business.role, "agent")}
            locale={locale}
            t={d.payments}
            errors={d.errors}
          />
        </div>
      </div>
    </div>
  );
}
