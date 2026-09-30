import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { DeleteButton } from "@/components/app/form";
import { ProductForm } from "@/components/app/product-form";
import { PageHeader } from "@/components/app/ui";
import { deleteProduct } from "@/lib/actions/products";
import { isUuid } from "@/lib/actions/form";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { getProduct } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.products.edit);

export default async function ProductPage({ params, searchParams }: PageProps<"/[lang]/dashboard/products/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/products/${id}`));
  const product = isUuid(id) ? await getProduct(business.id, id) : null;
  if (!product) notFound();
  const d = t.dashboard;
  const canEdit = canManageBusiness(business.role);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={product.name}
        back={{ href: localizePath(locale, "/dashboard/products"), label: d.products.title }}
        actions={
          canEdit ? <DeleteButton action={deleteProduct.bind(null, product.id, locale)} labels={d.common} errors={d.errors} note={d.products.deleteNote} /> : null
        }
      />
      {sp.saved ? <FormAlert tone="success">{d.products.saved}</FormAlert> : null}
      {!canEdit ? <FormAlert tone="info">{d.common.readOnly}</FormAlert> : null}
      <ProductForm
        t={d.products}
        text={{ errors: d.errors, saved: d.products.saved, saving: d.common.saving }}
        product={product}
        currency={product.currency}
        locale={locale}
        canEdit={canEdit}
        submitLabel={d.common.save}
      />
    </div>
  );
}
