import { notFound, redirect } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader, param } from "@/components/app/ui";
import { BusinessDocumentEditor } from "@/components/documents/business-editor";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getDocument, rowToDocument } from "@/lib/data/documents";
import { stateFromDocument } from "@/lib/documents/editor-state";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.documents.editTitle);

/** Drafts only: issued documents are records (void + duplicate to correct them). */
export default async function EditDocumentPage({ params, searchParams }: PageProps<"/[lang]/dashboard/documents/[id]/edit">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/documents/${id}/edit`));
  const row = isUuid(id) ? await getDocument(business.id, id) : null;
  if (!row) notFound();
  const view = localizePath(locale, `/dashboard/documents/${row.id}`);
  if (row.status !== "draft" || !hasRole(business.role, "agent")) redirect(view);
  const doc = t.dashboard.documents;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={doc.editTitle} back={{ href: view, label: t.docs.types[row.doc_type as keyof typeof t.docs.types] }} />
      {param(sp.duplicated) ? <FormAlert tone="success">{doc.duplicated}</FormAlert> : null}
      <BusinessDocumentEditor t={t} locale={locale} business={business} initial={stateFromDocument(rowToDocument(row), row.customer_id)} documentId={row.id} />
    </div>
  );
}
