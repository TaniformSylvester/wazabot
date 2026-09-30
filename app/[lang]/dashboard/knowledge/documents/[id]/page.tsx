import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { DeleteButton } from "@/components/app/form";
import { DocumentForm } from "@/components/app/knowledge-forms";
import { PageHeader } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { deleteKnowledge } from "@/lib/actions/knowledge";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { getDocument } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.knowledge.documents.edit);

export default async function EditDocumentPage({ params }: PageProps<"/[lang]/dashboard/knowledge/documents/[id]">) {
  const [locale, t, { id }] = await Promise.all([getLocale(), getMessages(), params]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/knowledge/documents/${id}`));
  const item = isUuid(id) ? await getDocument(business.id, id) : null;
  if (!item) notFound();
  const d = t.dashboard;
  const canEdit = canManageBusiness(business.role);
  const back = localizePath(locale, "/dashboard/knowledge?tab=documents");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={d.knowledge.documents.edit}
        back={{ href: back, label: d.knowledge.title }}
        actions={canEdit ? <DeleteButton action={deleteKnowledge.bind(null, "knowledge_documents", item.id)} labels={d.common} errors={d.errors} /> : null}
      />
      {!canEdit ? <FormAlert tone="info">{d.common.readOnly}</FormAlert> : null}
      <DocumentForm t={d.knowledge} text={{ errors: d.errors, saved: d.knowledge.saved, saving: d.common.saving }} doc={item} locale={locale} canEdit={canEdit} submitLabel={d.common.save} />
    </div>
  );
}
