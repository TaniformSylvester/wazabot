import { redirect } from "next/navigation";

import { FaqForm } from "@/components/app/knowledge-forms";
import { PageHeader } from "@/components/app/ui";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.knowledge.faqs.new);

export default async function NewFaqPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/knowledge/faqs/new"));
  const back = localizePath(locale, "/dashboard/knowledge?tab=faqs");
  if (!canManageBusiness(business.role)) redirect(back);
  const d = t.dashboard;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={d.knowledge.faqs.new} back={{ href: back, label: d.knowledge.title }} />
      <FaqForm t={d.knowledge} text={{ errors: d.errors, saved: d.knowledge.saved, saving: d.common.saving }} faq={null} locale={locale} canEdit submitLabel={d.common.save} />
    </div>
  );
}
