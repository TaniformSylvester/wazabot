import { MessagesSquare } from "lucide-react";

import { CONVERSATION_FILTERS, ConversationList, filterToQuery, type ConversationFilterKey } from "@/components/app/conversation-list";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { EmptyState, PageHeader, param } from "@/components/app/ui";
import { requireBusiness } from "@/lib/auth/dal";
import { countConversations, getWhatsAppConnection, listConversations } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.conversations.title);

export default async function ConversationsPage({ searchParams }: PageProps<"/[lang]/dashboard/conversations">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/conversations"));
  const c = t.dashboard.conversations;
  const filter = (CONVERSATION_FILTERS as readonly string[]).includes(param(sp.filter) ?? "") ? (param(sp.filter) as ConversationFilterKey) : "all";
  const q = param(sp.q);
  const [rows, total, connection] = await Promise.all([
    listConversations(business.id, { ...filterToQuery(filter), q }),
    countConversations(business.id),
    getWhatsAppConnection(business.id),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={c.title} actions={connection?.status === "connected" ? <AutoRefresh label={c.live} /> : null} />
      {total === 0 ? (
        <EmptyState icon={MessagesSquare} title={c.empty.title} text={c.empty.text} />
      ) : (
        <div className="grid overflow-hidden rounded-3xl border border-border bg-card shadow-card lg:h-[calc(100dvh-12rem)] lg:grid-cols-[22rem_1fr]">
          <div className="flex min-h-0 flex-col lg:border-r lg:border-border">
            <ConversationList rows={rows} filter={filter} q={q} t={c} searchLabel={t.dashboard.common.search} locale={locale} />
          </div>
          <div className="hidden flex-col items-center justify-center p-10 text-center lg:flex">
            <MessagesSquare className="size-10 text-line-strong" aria-hidden />
            <p className="mt-3 font-display text-lg font-bold text-deep">{c.select}</p>
            <p className="mt-1 max-w-sm text-sm text-slate">{c.selectText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
