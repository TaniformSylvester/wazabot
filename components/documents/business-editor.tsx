import { DocumentEditor } from "@/components/documents/document-editor";
import { saveDocument } from "@/lib/actions/documents";
import { hasRole, type CurrentBusiness } from "@/lib/auth/dal";
import { listDocumentCatalog, listDocumentCustomers } from "@/lib/data/documents";
import type { EditorState } from "@/lib/documents/editor-state";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { Messages } from "@/messages/en";

/** The document editor for a signed-in business: its customers, products and services, saved through saveDocument. */
export async function BusinessDocumentEditor({ t, locale, business, initial, documentId }: { t: Messages; locale: Locale; business: CurrentBusiness; initial: EditorState; documentId: string | null }) {
  const [customers, catalog] = await Promise.all([listDocumentCustomers(business.id), listDocumentCatalog(business.id)]);
  const e = t.dashboard.documents.editor;
  return (
    <DocumentEditor
      mode="business"
      t={t.docs}
      validation={t.auth.validation}
      initial={initial}
      fixedLogoUrl={business.logoUrl}
      customers={customers}
      catalog={catalog}
      canIssueReceipt={hasRole(business.role, "admin")}
      business={{ ...e, profileHref: localizePath(locale, "/dashboard/settings"), errors: t.dashboard.errors }}
      onSubmit={saveDocument.bind(null, locale, documentId)}
    />
  );
}
