import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { CopyText } from "@/components/app/copy-button";
import { EmptyState, PageHeader, Pagination, Panel, StatusBadge, TableWrap, buttonLink, formatDate, formatMoney, param, secondaryLink, td, th, withQuery } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { PAGE_SIZE, listCustomers } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { LANGUAGE_CODES, languageName } from "@/lib/i18n/languages";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { getBusinessModules } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.customers.title);

export default async function CustomersPage({ searchParams }: PageProps<"/[lang]/dashboard/customers">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/customers"));
  const d = t.dashboard;
  const c = d.customers;
  const filters = { q: param(sp.q), language: param(sp.language), tag: param(sp.tag), balance: param(sp.balance) === "1" ? "1" : undefined, page: Number(param(sp.page)) || 1 };
  const { rows, total, page } = await listCustomers(business.id, { ...filters, balance: !!filters.balance });
  const money = (v: number) => formatMoney(v, business.currency, locale);
  // A school without the sales module keeps parents here: their children, not purchases.
  const modules = await getBusinessModules(business);
  const school = modules.includes("school") && !modules.includes("commerce");
  const sc = c.school;
  const children = new Map<string, { id: string; name: string }[]>();
  if (school && rows.length) {
    const db = await createClient();
    const { data: students } = await db
      .from("school_students")
      .select("id, first_name, last_name, guardian_customer_id")
      .eq("business_id", business.id)
      .in("guardian_customer_id", rows.map((r) => r.id))
      .order("last_name");
    for (const st of students ?? []) {
      if (!st.guardian_customer_id) continue;
      children.set(st.guardian_customer_id, [...(children.get(st.guardian_customer_id) ?? []), { id: st.id, name: `${st.last_name.toUpperCase()} ${st.first_name}` }]);
    }
  }
  const canEdit = hasRole(business.role, "agent");
  const base = localizePath(locale, "/dashboard/customers");
  const filtered = !!(filters.q || filters.language || filters.tag || filters.balance);
  const newLink = canEdit ? (
    <Link href={localizePath(locale, "/dashboard/customers/new")} className={buttonLink}>
      <Plus aria-hidden /> {school ? sc.new : c.new}
    </Link>
  ) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={school ? sc.title : c.title} description={school ? sc.description : c.description} actions={newLink} />
      {param(sp.deleted) ? <FormAlert tone="success">{c.deleted}</FormAlert> : null}
      {total === 0 && !filtered ? (
        <EmptyState icon={Users} title={school ? sc.empty.title : c.empty.title} text={school ? sc.empty.text : c.empty.text} action={newLink} />
      ) : (
        <Panel>
          <form method="get" action={base} className="mb-4 flex flex-wrap gap-2" role="search">
            <label className="relative min-w-0 flex-1 basis-60">
              <span className="sr-only">{d.common.search}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
              <input name="q" defaultValue={filters.q} placeholder={school ? sc.searchPlaceholder : c.searchPlaceholder} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
            </label>
            <select name="language" defaultValue={filters.language ?? ""} aria-label={c.columns.language} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">
                {c.columns.language}: {d.common.all}
              </option>
              {LANGUAGE_CODES.map((l) => (
                <option key={l} value={l}>
                  {languageName(l, locale)}
                </option>
              ))}
            </select>
            <input name="tag" defaultValue={filters.tag} placeholder={c.columns.tags} aria-label={c.columns.tags} className="h-10 w-32 rounded-xl border border-input bg-card px-3 text-sm" />
            {school ? null : (
              <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm">
                <input type="checkbox" name="balance" value="1" defaultChecked={!!filters.balance} className="size-4 accent-waza-600" />
                {c.withBalance}
              </label>
            )}
            <button type="submit" className={secondaryLink}>
              {d.common.filter}
            </button>
            {filtered ? (
              <Link href={base} className="self-center px-2 text-sm font-semibold text-slate hover:underline">
                {d.common.clear}
              </Link>
            ) : null}
          </form>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate">{school ? sc.noResults : c.noResults}</p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>{c.columns.name}</th>
                  <th className={th}>{school ? sc.reference : c.columns.reference}</th>
                  <th className={th}>{c.columns.phone}</th>
                  {school ? (
                    <th className={th}>{sc.children}</th>
                  ) : (
                    <>
                      <th className={th}>{c.columns.orders}</th>
                      <th className={th}>{c.columns.spent}</th>
                      <th className={th}>{c.columns.outstanding}</th>
                      <th className={th}>{c.columns.lastPurchase}</th>
                    </>
                  )}
                  <th className={th}>{c.columns.city}</th>
                  <th className={th}>{c.columns.tags}</th>
                  <th className={th}>{c.columns.lastContact}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-mint/30" data-customer={r.name ?? r.whatsapp_phone} data-reference={r.reference}>
                    <td className={td}>
                      <Link href={localizePath(locale, `/dashboard/customers/${r.id}`)} className="font-semibold hover:underline">
                        {r.name || c.unnamed}
                      </Link>
                    </td>
                    <td className={`${td} text-slate`}>
                      <CopyText value={r.reference} label={format(c.copyReference, { reference: r.reference })} copiedLabel={c.copied} />
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate`}>+{r.whatsapp_phone}</td>
                    {school ? (
                      <td className={td} data-testid="parent-children">
                        {children.get(r.id)?.length ? (
                          <ul className="flex flex-col gap-0.5">
                            {children.get(r.id)!.map((st) => (
                              <li key={st.id}>
                                <Link href={localizePath(locale, `/dashboard/school/students/${st.id}`)} className="text-waza-700 hover:underline">
                                  {st.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate">{sc.noChildren}</span>
                        )}
                      </td>
                    ) : (
                      <>
                        <td className={`${td} text-slate`}>{formatNumber(r.stats.orders_count, locale)}</td>
                        <td className={`${td} whitespace-nowrap`}>{money(r.stats.total_spent)}</td>
                        <td className={`${td} whitespace-nowrap`}>{r.stats.outstanding > 0 ? <span className="font-semibold text-gold-800">{money(r.stats.outstanding)}</span> : <span className="text-slate">—</span>}</td>
                        <td className={`${td} whitespace-nowrap text-slate`}>{r.stats.last_purchase_at ? formatDate(r.stats.last_purchase_at, locale) : "—"}</td>
                      </>
                    )}
                    <td className={`${td} text-slate`}>{r.city ?? "—"}</td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {r.tags.length ? r.tags.map((tag) => <StatusBadge key={tag}>{tag}</StatusBadge>) : <span className="text-slate">—</span>}
                      </div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate`}>{r.last_contact_at ? formatDate(r.last_contact_at, locale) : c.never}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          {rows.length && !school ? <p className="mt-3 text-xs text-slate">{c.metricsNote}</p> : null}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} labels={d.common} hrefFor={(n) => withQuery(base, { ...filters, page: n })} />
        </Panel>
      )}
    </div>
  );
}
