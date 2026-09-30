import { redirect } from "next/navigation";

import { ProductForm } from "@/components/app/product-form";
import { PageHeader } from "@/components/app/ui";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.products.new);

export default async function NewProductPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/products/new"));
  if (!canManageBusiness(business.role)) redirect(localizePath(locale, "/dashboard/products"));
  const d = t.dashboard;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={d.products.new} back={{ href: localizePath(locale, "/dashboard/products"), label: d.products.title }} />
      <ProductForm
        t={d.products}
        text={{ errors: d.errors, saved: d.products.saved, saving: d.common.saving }}
        product={null}
        currency={business.currency}
        locale={locale}
        canEdit
        submitLabel={d.common.save}
      />
    </div>
  );
}
