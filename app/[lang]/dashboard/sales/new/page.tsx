import { FormAlert } from "@/components/auth/form-alert";
import { Pos } from "@/components/app/pos";
import { PageHeader } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listCustomerOptions, listPosProducts } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.sales.new);

/** The point of sale (agents and up). */
export default async function NewSalePage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/sales/new"));
  const d = t.dashboard;
  const canSell = hasRole(business.role, "agent");
  const [products, customers] = canSell ? await Promise.all([listPosProducts(business.id), listCustomerOptions(business.id)]) : [[], []];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={d.sales.new} back={{ href: localizePath(locale, "/dashboard/sales"), label: d.sales.title }} />
      {canSell ? (
        <Pos
          products={products}
          customers={customers}
          currency={business.currency}
          locale={locale}
          canDiscount={hasRole(business.role, "admin")}
          t={d.sales}
          payments={d.payments}
          productsHref={localizePath(locale, "/dashboard/products/new")}
        />
      ) : (
        <FormAlert tone="info">{d.common.readOnly}</FormAlert>
      )}
    </div>
  );
}
