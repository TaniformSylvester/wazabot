import { redirect } from "next/navigation";

import { PageHeader, param } from "@/components/app/ui";
import { BusinessDocumentEditor } from "@/components/documents/business-editor";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getDocumentSettings, listDocumentCustomers } from "@/lib/data/documents";
import { addDays, newEditorState } from "@/lib/documents/editor-state";
import { DOCUMENT_CURRENCIES, DOCUMENT_TYPES, type DocumentType } from "@/lib/documents/types";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.documents.title);

export default async function NewDocumentPage({ searchParams }: PageProps<"/[lang]/dashboard/documents/new">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/documents/new"));
  const back = localizePath(locale, "/dashboard/documents");
  if (!hasRole(business.role, "agent")) redirect(back);
  const requested = param(sp.type) as DocumentType | undefined;
  const wanted: DocumentType = requested && (DOCUMENT_TYPES as readonly string[]).includes(requested) ? requested : "invoice";
  // A receipt confirms money was received: only owners and admins make them.
  const type: DocumentType = wanted === "receipt" && !hasRole(business.role, "admin") ? "invoice" : wanted;
  const settings = await getDocumentSettings(business.id);
  const issue = new Date().toISOString().slice(0, 10);

  // From a customer's profile: ?customer=<id> fills in the customer.
  const customerId = param(sp.customer);
  const customer = customerId ? (await listDocumentCustomers(business.id)).find((c) => c.id === customerId) : undefined;

  const initial = newEditorState({
    type,
    template: settings.default_template,
    language: settings.default_language ?? (business.defaultLanguage === "en" ? "en" : "fr"),
    currency: (DOCUMENT_CURRENCIES as readonly string[]).includes(business.currency) ? (business.currency as (typeof DOCUMENT_CURRENCIES)[number]) : "XAF",
    issueDate: issue,
    dueDate: type === "invoice" ? addDays(issue, settings.default_due_days) : type === "quotation" ? addDays(issue, 30) : "",
    business: {
      name: business.name,
      reference: settings.business_reference ?? "",
      address: [business.address, business.city].filter(Boolean).join(", "),
      phone: business.phone ?? "",
      email: business.email ?? "",
      website: business.website ?? "",
    },
    ...(customer
      ? { customerId: customer.id, customer: { name: customer.name, reference: customer.reference, phone: customer.phone ?? "", email: customer.email ?? "", address: customer.address ?? "", website: "" } }
      : {}),
    taxRate: settings.default_tax_rate ? String(settings.default_tax_rate) : "",
    taxLabel: settings.default_tax_label ?? "",
    notes: settings.default_notes ?? "",
    terms: settings.default_terms ?? "",
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={t.dashboard.documents.newTitle[type]} back={{ href: back, label: t.dashboard.documents.title }} />
      <BusinessDocumentEditor t={t} locale={locale} business={business} initial={initial} documentId={null} />
    </div>
  );
}
