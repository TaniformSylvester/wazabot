import { redirect } from "next/navigation";

import { DocumentForm } from "@/components/app/knowledge-forms";
import { PageHeader, param } from "@/components/app/ui";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.knowledge.documents.new);

export default async function NewDocumentPage({ searchParams }: PageProps<"/[lang]/dashboard/knowledge/documents/new">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/knowledge/documents/new"));
  const back = localizePath(locale, "/dashboard/knowledge?tab=documents");
  if (!canManageBusiness(business.role)) redirect(back);
  const d = t.dashboard;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={d.knowledge.documents.new} back={{ href: back, label: d.knowledge.title }} />
      <DocumentForm t={d.knowledge} text={{ errors: d.errors, saved: d.knowledge.saved, saving: d.common.saving }} doc={null} defaultType={param(sp.type)} locale={locale} canEdit submitLabel={d.common.save} />
    </div>
  );
}
