import Link from "next/link";
import { BookOpen, FileText, Plus, Search } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, DeleteButton } from "@/components/app/form";
import { EmptyState, LinkTabs, PageHeader, Panel, StatusBadge, buttonLink, formatDate, param, secondaryLink } from "@/components/app/ui";
import { deleteKnowledge, setKnowledgeActive } from "@/lib/actions/knowledge";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { listDocuments, listFaqs } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { DOCUMENT_TYPES } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.knowledge.title);

export default async function KnowledgePage({ searchParams }: PageProps<"/[lang]/dashboard/knowledge">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/knowledge"));
  const d = t.dashboard;
  const k = d.knowledge;
  const tab = param(sp.tab) === "documents" ? "documents" : "faqs";
  const q = param(sp.q);
  const [faqs, docs] = await Promise.all([listFaqs(business.id, tab === "faqs" ? q : undefined), listDocuments(business.id, tab === "documents" ? q : undefined)]);
  const canEdit = canManageBusiness(business.role);
  const href = (p: string) => localizePath(locale, p);
  const newHref = href(tab === "faqs" ? "/dashboard/knowledge/faqs/new" : "/dashboard/knowledge/documents/new");
  const newLabel = tab === "faqs" ? k.faqs.new : k.documents.new;
  const items = tab === "faqs" ? faqs : docs;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={k.title}
        description={k.description}
        actions={
          canEdit ? (
            <Link href={newHref} className={buttonLink}>
              <Plus aria-hidden /> {newLabel}
            </Link>
          ) : null
        }
      />
      {param(sp.saved) ? <FormAlert tone="success">{k.saved}</FormAlert> : null}
      <LinkTabs
        active={tab}
        tabs={[
          { key: "faqs", label: k.tabs.faqs, href: href("/dashboard/knowledge?tab=faqs"), count: tab === "faqs" && q ? undefined : faqs.length },
          { key: "documents", label: k.tabs.documents, href: href("/dashboard/knowledge?tab=documents"), count: tab === "documents" && q ? undefined : docs.length },
        ]}
      />

      {items.length === 0 && !q ? (
        <EmptyState
          icon={tab === "faqs" ? BookOpen : FileText}
          title={tab === "faqs" ? k.faqs.empty.title : k.documents.empty.title}
          text={tab === "faqs" ? k.faqs.empty.text : k.documents.empty.text}
          action={
            canEdit ? (
              <Link href={newHref} className={buttonLink}>
                <Plus aria-hidden /> {newLabel}
              </Link>
            ) : null
          }
        />
      ) : (
        <Panel>
          <form method="get" className="mb-4 flex flex-wrap gap-2" role="search">
            <input type="hidden" name="tab" value={tab} />
            <label className="relative min-w-0 flex-1 basis-60">
              <span className="sr-only">{d.common.search}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
              <input name="q" defaultValue={q} placeholder={d.common.search} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
            </label>
            <button type="submit" className={secondaryLink}>
              {d.common.search}
            </button>
          </form>
          {items.length === 0 ? <p className="py-8 text-center text-sm text-slate">{format(d.common.results, { count: 0 })}</p> : null}
          <ul className="divide-y divide-border">
            {tab === "faqs"
              ? faqs.map((f) => (
                  <li key={f.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <Link href={href(`/dashboard/knowledge/faqs/${f.id}`)} className="font-semibold text-deep hover:underline">
                        {f.question}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-slate">{f.answer}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge tone={f.active ? "green" : "neutral"} dot>
                          {f.active ? d.common.active : d.common.inactive}
                        </StatusBadge>
                        {f.category ? <StatusBadge>{f.category}</StatusBadge> : null}
                        <span className="text-xs text-slate">
                          {k.faqs.fields.priority}: {f.priority}
                        </span>
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 flex-wrap items-start gap-2">
                        <ActionButton action={setKnowledgeActive.bind(null, "faqs", f.id, !f.active)} errors={d.errors} variant="ghost">
                          {f.active ? d.common.deactivate : d.common.activate}
                        </ActionButton>
                        <DeleteButton action={deleteKnowledge.bind(null, "faqs", f.id)} labels={d.common} errors={d.errors} />
                      </div>
                    ) : null}
                  </li>
                ))
              : docs.map((doc) => (
                  <li key={doc.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <Link href={href(`/dashboard/knowledge/documents/${doc.id}`)} className="font-semibold text-deep hover:underline">
                        {doc.title}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-slate">{doc.content}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge tone={doc.active ? "green" : "neutral"} dot>
                          {doc.active ? d.common.active : d.common.inactive}
                        </StatusBadge>
                        <StatusBadge tone="blue">
                          {(DOCUMENT_TYPES as readonly string[]).includes(doc.document_type) ? k.documents.types[doc.document_type as (typeof DOCUMENT_TYPES)[number]] : doc.document_type}
                        </StatusBadge>
                        <span className="text-xs text-slate">{format(d.common.updatedAt, { date: formatDate(doc.updated_at, locale) })}</span>
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 flex-wrap items-start gap-2">
                        <ActionButton action={setKnowledgeActive.bind(null, "knowledge_documents", doc.id, !doc.active)} errors={d.errors} variant="ghost">
                          {doc.active ? d.common.deactivate : d.common.activate}
                        </ActionButton>
                        <DeleteButton action={deleteKnowledge.bind(null, "knowledge_documents", doc.id)} labels={d.common} errors={d.errors} />
                      </div>
                    ) : null}
                  </li>
                ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
