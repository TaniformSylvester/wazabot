import Link from "next/link";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n/config";
import { currencyLabel, format, formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/*
 * Server-safe building blocks shared by every dashboard page. Nothing here
 * invents data: empty values render as an explicit "No data yet" / "—".
 */

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-waza-700 hover:underline">
            <ChevronLeft className="size-4" aria-hidden /> {back.label}
          </Link>
        ) : null}
        <h1 className="type-h2 break-words">{title}</h1>
        {description ? <p className="type-body mt-1 max-w-3xl text-slate">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={headingId} className="type-h3 text-lg">{title}</h2>
            {description ? <p className="type-small mt-1 text-slate">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-3xl border border-dashed border-line-strong bg-card/60 px-6 py-12 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-mint text-waza-700">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-4 font-display text-lg font-bold text-deep">{title}</p>
      {text ? <p className="mt-1 max-w-md text-sm text-slate">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** A metric; `value === null` renders the "No data yet" label instead of a number. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  noData,
}: {
  label: string;
  value: string | null;
  icon: LucideIcon;
  hint?: string;
  noData: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate">{label}</p>
        <Icon className="size-4.5 shrink-0 text-slate" aria-hidden />
      </div>
      {value === null ? (
        <p className="mt-3 text-sm font-semibold text-slate">{noData}</p>
      ) : (
        <p className="mt-2 font-display text-3xl font-bold text-deep">{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-slate">{hint}</p> : null}
    </div>
  );
}

const TONES = {
  neutral: "bg-surface text-slate",
  green: "bg-success-bg text-success",
  blue: "bg-waza-100 text-waza-800",
  amber: "bg-gold-100 text-gold-800",
  red: "bg-coral-100 text-coral-700",
  dark: "bg-deep text-cream",
} as const;
export type BadgeTone = keyof typeof TONES;

export function StatusBadge({ tone = "neutral", children, dot, wrap }: { tone?: BadgeTone; children: React.ReactNode; dot?: boolean; wrap?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        wrap ? "max-w-full" : "shrink-0 whitespace-nowrap",
        TONES[tone],
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export const orderStatusTone: Record<string, BadgeTone> = {
  pending: "amber",
  confirmed: "blue",
  processing: "blue",
  ready: "blue",
  out_for_delivery: "blue",
  delivered: "green",
  cancelled: "red",
  returned: "neutral",
};
export const paymentStatusTone: Record<string, BadgeTone> = { unpaid: "neutral", partial: "amber", pending: "amber", paid: "green", partially_refunded: "neutral", refunded: "neutral", failed: "red" };
export const conversationStatusTone: Record<string, BadgeTone> = { open: "green", pending: "amber", resolved: "neutral", archived: "neutral" };

export function DefinitionList({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <dt className="shrink-0 text-sm text-slate">{r.label}</dt>
          <dd className="min-w-0 break-words text-sm font-medium text-deep sm:text-right">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontally scrollable table wrapper, so wide tables never overflow the page on phones. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative -mx-5 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
export const th = "border-b border-border px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate sm:px-3";
export const td = "border-b border-border px-5 py-3 align-middle text-deep sm:px-3";

export function Pagination({
  page,
  total,
  pageSize,
  hrefFor,
  labels,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  labels: { previous: string; next: string; pageOf: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const link = "inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-deep hover:bg-mint";
  return (
    <nav className="flex items-center justify-between gap-3 pt-4 text-sm" aria-label={format(labels.pageOf, { page, pages })}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={link}>
          <ChevronLeft className="size-4" aria-hidden /> {labels.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-slate">{format(labels.pageOf, { page, pages })}</span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={link}>
          {labels.next} <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Link-based tabs (server-rendered, work without JavaScript). */
export function LinkTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-full border border-border bg-card p-1" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={t.key === active}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
            t.key === active ? "bg-deep text-cream" : "text-slate hover:bg-mint hover:text-deep",
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 opacity-70">{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function formatMoney(amount: number | string, currency: string, locale: Locale) {
  return `${formatNumber(Number(amount), locale)} ${currencyLabel(currency)}`;
}

export function formatDate(value: string | null | undefined, locale: Locale, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "Africa/Douala",
  }).format(new Date(value));
}

export function formatPercent(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale[locale], { style: "percent", maximumFractionDigits: 0 }).format(value);
}

/** Reads a single string from Next's searchParams. */
export function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

/** Builds `path?query`, dropping empty values. */
export function withQuery(path: string, query: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export const buttonLink =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-waza-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/35 [&_svg]:size-4";
export const secondaryLink =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-semibold text-deep transition-colors hover:bg-mint focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/35 [&_svg]:size-4";
