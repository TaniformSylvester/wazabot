import { redirect } from "next/navigation";

import { OrderBuilder } from "@/components/app/order-builder";
import { PageHeader, param } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listCustomerOptions, listSellableProducts } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.orders.new);

export default async function NewOrderPage({ searchParams }: PageProps<"/[lang]/dashboard/orders/new">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/orders/new"));
  const back = localizePath(locale, "/dashboard/orders");
  if (!hasRole(business.role, "agent")) redirect(back);
  const [customers, products] = await Promise.all([listCustomerOptions(business.id), listSellableProducts(business.id)]);
  const d = t.dashboard;
  const customer = param(sp.customer);
  const conversation = param(sp.conversation);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={d.orders.new} description={d.orders.description} back={{ href: back, label: d.orders.title }} />
      <OrderBuilder
        t={d.orders}
        text={{ errors: d.errors, saved: d.orders.saved, saving: d.common.saving }}
        customers={customers}
        products={products.map((p) => ({ ...p, price: Number(p.price), product_variants: p.product_variants.map((v) => ({ ...v, price_modifier: Number(v.price_modifier) })) }))}
        currency={business.currency}
        locale={locale}
        defaultCustomerId={isUuid(customer) ? customer : undefined}
        conversationId={isUuid(conversation) ? conversation : undefined}
      />
    </div>
  );
}
