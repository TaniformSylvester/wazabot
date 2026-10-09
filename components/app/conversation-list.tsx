import Link from "next/link";
import { Search } from "lucide-react";

import { StatusBadge, formatDate } from "@/components/app/ui";
import type { listConversations } from "@/lib/data/queries";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

type Row = Awaited<ReturnType<typeof listConversations>>[number];
type C = Messages["dashboard"]["conversations"];

export const CONVERSATION_FILTERS = ["all", "open", "pending", "resolved", "archived", "unread", "human", "ai"] as const;
export type ConversationFilterKey = (typeof CONVERSATION_FILTERS)[number];

export function filterToQuery(f: ConversationFilterKey): { status?: string; mode?: "ai" | "human" | "unread" } {
  if (f === "unread" || f === "human" || f === "ai") return { mode: f };
  if (f === "all") return {};
  return { status: f };
}

/** Left pane: filters, search and the conversation list. Links keep the current filter. */
export function ConversationList({
  rows,
  activeId,
  filter,
  q,
  t,
  searchLabel,
  locale,
}: {
  rows: Row[];
  activeId?: string;
  filter: ConversationFilterKey;
  q?: string;
  t: C;
  searchLabel: string;
  locale: Locale;
}) {
  const qs = (f: ConversationFilterKey) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("filter", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const current = qs(filter);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <form method="get" action={localizePath(locale, "/dashboard/conversations")} role="search" className="relative">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label className="sr-only" htmlFor="conv-search">
            {searchLabel}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
          <input id="conv-search" name="q" defaultValue={q} placeholder={t.searchPlaceholder} className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-sm" />
        </form>
        <div className="-mx-1 mt-2 flex flex-wrap gap-1.5 px-1 pb-1">
          {CONVERSATION_FILTERS.map((f) => (
            <Link
              key={f}
              href={localizePath(locale, `/dashboard/conversations${qs(f)}`)}
              aria-current={f === filter ? "true" : undefined}
              className={cn(
                "inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold",
                f === filter ? "bg-deep text-cream" : "bg-surface text-slate hover:bg-mint hover:text-deep",
              )}
            >
              {t.filters[f]}
            </Link>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate">{t.empty.title}</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {rows.map((r) => {
            const name = r.customers?.name || `+${r.customers?.whatsapp_phone ?? ""}`;
            return (
              <li key={r.id}>
                <Link
                  href={localizePath(locale, `/dashboard/conversations/${r.id}${current}`)}
                  aria-current={r.id === activeId ? "page" : undefined}
                  className={cn("flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-mint/40", r.id === activeId && "bg-mint")}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-sm text-deep", r.unread_count > 0 ? "font-bold" : "font-semibold")}>{name}</span>
                    <span className="shrink-0 text-xs text-slate">{formatDate(r.last_message_at ?? r.created_at, locale)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={r.ai_enabled ? "blue" : "amber"}>{r.ai_enabled ? t.aiOnline : t.humanMode}</StatusBadge>
                    {r.status !== "open" ? <StatusBadge>{t.statuses[r.status as keyof C["statuses"]] ?? r.status}</StatusBadge> : null}
                    {r.human_requested ? <StatusBadge tone="red">{t.humanRequested}</StatusBadge> : null}
                    {r.unread_count > 0 ? (
                      <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-waza-500 px-1.5 text-[0.6875rem] font-bold text-deep">{r.unread_count}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
