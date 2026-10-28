import { FormAlert } from "@/components/auth/form-alert";
import { Pos } from "@/components/app/pos";
import { PageHeader, param } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listCustomerOptions, listPosProducts } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { branchStock, getBranchContext, withBranchStock } from "@/lib/branches";

export const generateMetadata = dashboardMetadata((d) => d.sales.new);

/** The point of sale (agents and up). */
export default async function NewSalePage({ searchParams }: PageProps<"/[lang]/dashboard/sales/new">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/sales/new"));
  const d = t.dashboard;
  const canSell = hasRole(business.role, "agent");
  const [all, customers, branch] = canSell ? await Promise.all([listPosProducts(business.id), listCustomerOptions(business.id), getBranchContext(business)]) : [[], [], null];
  // Several branches: the till shows (and sells) the stock of the branch it's in.
  const products = branch?.multi ? withBranchStock(all, await branchStock(business.id, branch.current.id)) : all;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title={d.sales.new}
        description={branch?.multi ? `${d.branches.branch}: ${branch.current.name}` : undefined}
        back={{ href: localizePath(locale, "/dashboard/sales"), label: d.sales.title }}
      />
      {canSell ? (
        <Pos
          products={products}
          customers={customers}
          defaultCustomer={param(sp.customer)}
          currency={business.currency}
          locale={locale}
          canDiscount={hasRole(business.role, "admin")}
          t={d.sales}
          picker={d.products.picker}
          payments={d.payments}
          productsHref={localizePath(locale, "/dashboard/products/new")}
        />
      ) : (
        <FormAlert tone="info">{d.common.readOnly}</FormAlert>
      )}
    </div>
  );
}
