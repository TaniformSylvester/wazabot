import { Check } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader, Panel, StatusBadge, formatDate, formatMoney } from "@/components/app/ui";
import { requireBusiness } from "@/lib/auth/dal";
import { getBilling } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

export const generateMetadata = dashboardMetadata((d) => d.billing.title);

/** Plans come from the `plans` table (configurable). No payment is processed in this stage. */
export default async function BillingPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/billing"));
  const { plans, subscription, aiConversationsUsed } = await getBilling(business.id);
  const b = t.dashboard.billing;
  const current = subscription?.plans ?? null;
  const limit = current?.ai_conversations_per_month ?? 0;
  const usedPct = limit ? Math.min(100, (aiConversationsUsed / limit) * 100) : 0;
  const statusLabel = subscription ? (b.status[subscription.status as keyof typeof b.status] ?? subscription.status) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={b.title} description={b.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={b.currentPlan}>
          {current && subscription ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-display text-2xl font-bold text-deep">{current.name}</p>
                {statusLabel ? <StatusBadge tone="green">{statusLabel}</StatusBadge> : null}
              </div>
              <p className="text-sm text-slate">
                {formatMoney(current.monthly_price, current.currency, locale)}
                {b.perMonth}
              </p>
              <p className="text-xs text-slate">
                {format(b.period, { start: formatDate(subscription.current_period_start, locale), end: formatDate(subscription.current_period_end, locale) })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate">{t.dashboard.common.noDataYet}</p>
          )}
        </Panel>
        <Panel title={b.usage}>
          <p className="font-display text-2xl font-bold text-deep">{format(b.usageOf, { used: formatNumber(aiConversationsUsed, locale), limit: formatNumber(limit, locale) })}</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={aiConversationsUsed} aria-label={b.usage}>
            <div className="h-full rounded-full bg-waza-500" style={{ width: `${usedPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate">{b.usageNote}</p>
        </Panel>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = subscription?.plan_id === p.id;
          return (
            <li key={p.id} className={cn("flex flex-col rounded-3xl border bg-card p-5 shadow-card", isCurrent ? "border-waza-500 ring-2 ring-waza-500/30" : "border-border")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-bold text-deep">{p.name}</p>
                {isCurrent ? (
                  <StatusBadge tone="green">
                    <Check className="size-3" aria-hidden /> {b.current}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="mt-3 font-display text-2xl font-bold text-deep">
                {formatMoney(p.monthly_price, p.currency, locale)}
                <span className="text-sm font-normal text-slate">{b.perMonth}</span>
              </p>
              <p className="mt-2 text-sm text-slate">{format(b.conversations, { count: formatNumber(p.ai_conversations_per_month, locale) })}</p>
            </li>
          );
        })}
      </ul>
      <FormAlert tone="info">
        {b.changeSoon} {b.noPayments}
      </FormAlert>
    </div>
  );
}
