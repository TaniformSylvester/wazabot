import Link from "next/link";
import { ArrowRight, FileText, Plus, Search, Settings2 } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { documentStatusTone } from "@/components/documents/status";
import { EmptyState, PageHeader, Pagination, Panel, StatusBadge, TableWrap, buttonLink, formatMoney, param, secondaryLink, td, th, withQuery } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { DOCUMENTS_PAGE_SIZE, displayStatus, listDocuments } from "@/lib/data/documents";
import { formatDocDate } from "@/lib/documents/labels";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/documents/types";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.documents.title);

export default async function DocumentsPage({ searchParams }: PageProps<"/[lang]/dashboard/documents">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/documents"));
  const d = t.dashboard;
  const doc = d.documents;
  const filters = { q: param(sp.q), type: param(sp.type), status: param(sp.status), page: Number(param(sp.page)) || 1 };
  const { rows, total, page } = await listDocuments(business.id, filters);
  const canCreate = hasRole(business.role, "agent");
  const base = localizePath(locale, "/dashboard/documents");
  const filtered = !!(filters.q || filters.type || filters.status);
  const newLinks = canCreate ? (
    <div className="flex flex-wrap gap-2">
      {DOCUMENT_TYPES.map((type, i) => (
        <Link key={type} href={localizePath(locale, `/dashboard/documents/new?type=${type}`)} className={i === 0 ? buttonLink : secondaryLink}>
          <Plus aria-hidden /> {doc.new[type]}
        </Link>
      ))}
    </div>
  ) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={doc.title}
        description={doc.description}
        actions={
          hasRole(business.role, "admin") ? (
            <Link href={localizePath(locale, "/dashboard/documents/settings")} className={secondaryLink}>
              <Settings2 aria-hidden /> {doc.settingsLink}
            </Link>
          ) : null
        }
      />
      {param(sp.deleted) ? <FormAlert tone="success">{doc.deleted}</FormAlert> : null}
      {newLinks}
      {total === 0 && !filtered ? (
        <EmptyState icon={FileText} title={doc.empty.title} text={doc.empty.text} />
      ) : (
        <Panel>
          <form method="get" action={base} className="mb-4 flex flex-wrap gap-2" role="search">
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">{doc.filters.search}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
              <input name="q" defaultValue={filters.q} placeholder={doc.filters.search} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
            </label>
            <select name="type" defaultValue={filters.type ?? ""} aria-label={doc.columns.type} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">{doc.filters.allTypes}</option>
              {DOCUMENT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t.docs.types[x]}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={filters.status ?? ""} aria-label={doc.columns.status} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">{doc.filters.allStatuses}</option>
              {DOCUMENT_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {doc.statuses[x]}
                </option>
              ))}
            </select>
            <button type="submit" className={secondaryLink}>
              {doc.filters.apply}
            </button>
            {filtered ? (
              <Link href={base} className="self-center px-2 text-sm font-semibold text-slate hover:underline">
                {doc.filters.clear}
              </Link>
            ) : null}
          </form>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate">{doc.noResults}</p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>{doc.columns.number}</th>
                  <th className={th}>{doc.columns.type}</th>
                  <th className={th}>{doc.columns.customer}</th>
                  <th className={th}>{doc.columns.date}</th>
                  <th className={`${th} text-right`}>{doc.columns.total}</th>
                  <th className={th}>{doc.columns.status}</th>
                  <th className={th}>
                    <span className="sr-only">{doc.view.edit}</span>
                  </th>
                </tr>
              </thead>
              <tbody data-testid="documents-rows">
                {rows.map((r) => {
                  const status = displayStatus(r);
                  const href = localizePath(locale, `/dashboard/documents/${r.id}`);
                  const customer = (r.customer_snapshot ?? {}) as { name?: string };
                  return (
                    <tr key={r.id} className="hover:bg-mint/30">
                      <td className={td}>
                        <Link href={href} className="font-semibold whitespace-nowrap hover:underline">
                          {r.number ?? doc.statuses.draft}
                        </Link>
                      </td>
                      <td className={td}>{t.docs.types[r.doc_type as keyof typeof t.docs.types]}</td>
                      <td className={td}>{customer.name ?? "—"}</td>
                      <td className={`${td} whitespace-nowrap text-slate`}>{formatDocDate(r.issue_date, locale)}</td>
                      <td className={`${td} text-right font-semibold whitespace-nowrap`}>{formatMoney(r.total, r.currency, locale)}</td>
                      <td className={td}>
                        <StatusBadge tone={documentStatusTone[status]}>{doc.statuses[status]}</StatusBadge>
                      </td>
                      <td className={`${td} text-right`}>
                        <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold whitespace-nowrap text-waza-700 hover:underline">
                          {d.orders.view} <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
          <Pagination page={page} total={total} pageSize={DOCUMENTS_PAGE_SIZE} labels={d.common} hrefFor={(n) => withQuery(base, { ...filters, page: n })} />
        </Panel>
      )}
    </div>
  );
}
