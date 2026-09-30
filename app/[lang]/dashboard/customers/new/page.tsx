import { redirect } from "next/navigation";

import { CustomerForm } from "@/components/app/customer-form";
import { PageHeader } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.customers.new);

export default async function NewCustomerPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/customers/new"));
  const back = localizePath(locale, "/dashboard/customers");
  if (!hasRole(business.role, "agent")) redirect(back);
  const d = t.dashboard;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={d.customers.new} back={{ href: back, label: d.customers.title }} />
      <CustomerForm t={d.customers} text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }} customer={null} locale={locale} canEdit submitLabel={d.common.save} />
    </div>
  );
}
