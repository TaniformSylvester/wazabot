import { notFound } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { DeleteButton } from "@/components/app/form";
import { FaqForm } from "@/components/app/knowledge-forms";
import { PageHeader } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { deleteKnowledge } from "@/lib/actions/knowledge";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { getFaq } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.knowledge.faqs.edit);

export default async function EditFaqPage({ params }: PageProps<"/[lang]/dashboard/knowledge/faqs/[id]">) {
  const [locale, t, { id }] = await Promise.all([getLocale(), getMessages(), params]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/knowledge/faqs/${id}`));
  const item = isUuid(id) ? await getFaq(business.id, id) : null;
  if (!item) notFound();
  const d = t.dashboard;
  const canEdit = canManageBusiness(business.role);
  const back = localizePath(locale, "/dashboard/knowledge?tab=faqs");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={d.knowledge.faqs.edit}
        back={{ href: back, label: d.knowledge.title }}
        actions={canEdit ? <DeleteButton action={deleteKnowledge.bind(null, "faqs", item.id)} labels={d.common} errors={d.errors} /> : null}
      />
      {!canEdit ? <FormAlert tone="info">{d.common.readOnly}</FormAlert> : null}
      <FaqForm t={d.knowledge} text={{ errors: d.errors, saved: d.knowledge.saved, saving: d.common.saving }} faq={item} locale={locale} canEdit={canEdit} submitLabel={d.common.save} />
    </div>
  );
}
