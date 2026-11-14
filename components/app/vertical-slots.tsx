import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { formatMoney, formatPercent } from "@/components/app/ui";
import { VERTICAL_CONFIG, type KpiFormat, type Vertical } from "@/config/verticals";
import type { Locale } from "@/lib/i18n/config";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import type { Messages } from "@/messages/en";

/*
 * The dashboard's vertical slots (config/verticals.ts): three headline
 * numbers, the work queue, four quick actions and the catalogue. Server
 * components only — plain links and CSS, no client JavaScript — so they
 * render at once on a low-end phone over a weak connection.
 */

export type QueueItem = { id: string; title: string; detail: string; href: string; aside?: string };
export type VerticalView = {
  /** Values by KPI key; null when there is nothing to show yet. */
  kpis: Record<string, number | null>;
  /** Optional one-line hint under a KPI, by key. */
  hints?: Record<string, string>;
  queue: QueueItem[];
  /** How many items the queue holds in all (the list shows the first few). */
  queueTotal: number;
  catalogCount: number | null;
};

type V = Messages["dashboard"]["verticals"];
/** The words every vertical has (dashboard.verticals.<vertical>); tests/unit/verticals.test.ts checks every config key has them. */
export type VerticalText = {
  kpis: Record<string, string>;
  queueTitle: string;
  queueEmpty: string;
  actions: Record<string, { short: string; full: string }>;
  catalogLabel: string;
  catalogCount: string;
};

export function VerticalSlots({ vertical, view, t, currency, locale }: { vertical: Vertical; view: VerticalView; t: V; currency: string; locale: Locale }) {
  const cfg = VERTICAL_CONFIG[vertical];
  const w: VerticalText = t[vertical];
  const href = (p: string) => localizePath(locale, p);
  const show = (fmt: KpiFormat, v: number | null) =>
    v === null ? "—" : fmt === "currency" ? formatMoney(v, currency, locale) : fmt === "percent" ? formatPercent(v, locale) : formatNumber(v, locale);
  const Catalog = cfg.catalog.icon;
  return (
    <section aria-label={t.label} className="flex flex-col gap-4" data-testid="vertical-slots" data-vertical={vertical}>
      {/* Three headline numbers: three across even on a phone, numbers first. */}
      <ul className="grid grid-cols-3 gap-2 sm:gap-3 [&>li]:min-w-0" data-testid="vertical-kpis">
        {cfg.kpis.map(({ key, icon: Icon, format: fmt, href: to }) => (
          <li key={key}>
            <Link href={href(to)} className="flex h-full flex-col gap-1 rounded-2xl border border-border bg-card p-3 shadow-card transition-colors hover:border-waza-500 sm:p-4" data-testid={`kpi-${key}`}>
              <span className="flex items-center justify-between gap-1 text-[0.6875rem] leading-tight text-slate sm:text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere]">{w.kpis[key]}</span>
                <Icon className="hidden size-4 shrink-0 text-waza-600 sm:block" aria-hidden />
              </span>
              <span className="font-display text-base font-bold leading-tight text-deep [overflow-wrap:anywhere] sm:text-2xl">{show(fmt, view.kpis[key] ?? null)}</span>
              {view.hints?.[key] ? <span className="hidden text-xs text-slate sm:block">{view.hints[key]}</span> : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* Four quick actions: two by two on a phone (short labels), four across from tablets (full labels). */}
      <nav aria-label={t.quickActions} data-testid="vertical-actions">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {cfg.quickActions.map(({ key, icon: Icon, href: to }, i) => {
            const label = w.actions[key];
            return (
              <li key={key}>
                <Link
                  href={href(to)}
                  className={
                    i === 0
                      ? "flex min-h-12 items-center gap-2 rounded-2xl bg-waza-500 px-3 py-2.5 text-sm font-semibold text-deep hover:bg-waza-400"
                      : "flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-deep hover:bg-mint"
                  }
                  data-testid={`action-${key}`}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className="sm:hidden">{label.short}</span>
                  <span className="hidden sm:inline">{label.full}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        {/* The work queue: the oldest first, so the next thing to do is on top. */}
        <section aria-labelledby="vertical-queue-title" className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" data-testid="vertical-queue">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="vertical-queue-title" className="font-display text-base font-bold text-deep sm:text-lg">
              {w.queueTitle}
              {view.queueTotal ? <span className="ml-2 rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-waza-700">{formatNumber(view.queueTotal, locale)}</span> : null}
            </h2>
            <Link href={href(cfg.queue.href)} className="shrink-0 text-sm font-semibold text-waza-700 hover:underline">
              {t.seeAll}
            </Link>
          </div>
          {view.queue.length ? (
            <ul className="mt-3 divide-y divide-border">
              {view.queue.map((q) => (
                <li key={q.id}>
                  <Link href={href(q.href)} className="flex min-h-12 items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-deep">{q.title}</span>
                      <span className="block truncate text-xs text-slate">{q.detail}</span>
                    </span>
                    {q.aside ? <span className="shrink-0 font-semibold whitespace-nowrap text-deep">{q.aside}</span> : null}
                    <ChevronRight className="size-4 shrink-0 text-slate" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl bg-surface px-4 py-6 text-center text-sm text-slate" data-testid="vertical-queue-empty">
              {w.queueEmpty}
            </p>
          )}
        </section>

        {/* The catalogue, under its name for this business type. */}
        <Link href={href(cfg.catalog.href)} className="flex items-center gap-3 self-start rounded-2xl border border-border bg-card p-4 shadow-card hover:border-waza-500" data-testid="vertical-catalog">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-waza-700">
            <Catalog className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-deep">{w.catalogLabel}</span>
            {view.catalogCount !== null ? <span className="block text-xs text-slate">{format(w.catalogCount, { count: formatNumber(view.catalogCount, locale) })}</span> : null}
          </span>
          <ChevronRight className="size-4 shrink-0 text-slate" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
