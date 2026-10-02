import { Check } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { PageHeader, Panel, StatusBadge, formatDate, formatMoney } from "@/components/app/ui";
import { cancelPlanChange, requestPlanChange } from "@/lib/actions/billing";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getBilling } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

export const generateMetadata = dashboardMetadata((d) => d.billing.title);

/**
 * Plans come from the `plans` table (configurable). No payment is processed:
 * owners/admins request a plan; the WazaBolt team approves it once paid.
 */
export default async function BillingPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/billing"));
  const { plans, subscription, usage, pendingRequest } = await getBilling(business.id);
  const b = t.dashboard.billing;
  const d = t.dashboard;
  const canRequest = hasRole(business.role, "admin");
  const current = subscription?.plans ?? null;
  const limit = usage?.limit ?? current?.ai_conversations_per_month ?? 0;
  const aiConversationsUsed = usage?.used ?? 0;
  const usedPct = limit ? Math.min(100, (aiConversationsUsed / limit) * 100) : 0;
  const requestedPlan = pendingRequest ? plans.find((p) => p.id === pendingRequest.to_plan_id) : null;
  const formText = { errors: d.errors, saved: b.change.sent, saving: b.change.sending };
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
            <div
              className={cn("h-full rounded-full", usage?.level === "reached" ? "bg-coral-600" : usage?.level === "warning" ? "bg-gold" : "bg-waza-500")}
              style={{ width: `${usedPct}%` }}
            />
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
      {pendingRequest ? (
        <Panel title={b.pending.title}>
          <p className="text-sm text-slate">
            {format(b.pending.text, { plan: requestedPlan?.name ?? pendingRequest.to_plan_id, date: formatDate(pendingRequest.created_at, locale) })}
          </p>
          {canRequest ? (
            <div className="mt-4">
              <ActionButton action={cancelPlanChange.bind(null, pendingRequest.id)} pendingLabel={b.pending.cancelling} errors={d.errors}>
                {b.pending.cancel}
              </ActionButton>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Panel title={b.change.title} description={b.change.description}>
        {canRequest ? (
          <ActionForm action={requestPlanChange} text={formText} successMessage={b.change.sent} className="max-w-xl">
            <SelectField
              name="plan_id"
              label={b.change.plan}
              defaultValue={pendingRequest?.to_plan_id ?? plans.find((p) => p.id !== subscription?.plan_id && p.monthly_price > (current?.monthly_price ?? 0))?.id}
              options={plans
                .filter((p) => p.id !== subscription?.plan_id)
                .map((p) => ({ value: p.id, label: `${p.name} — ${formatMoney(p.monthly_price, p.currency, locale)}${b.perMonth}` }))}
            />
            <TextField name="contact_phone" label={b.change.phone} type="tel" inputMode="tel" autoComplete="tel" maxLength={40} defaultValue={business.phone ?? ""} />
            <TextField name="note" label={b.change.note} maxLength={500} />
            <div>
              <SubmitButton>{b.change.submit}</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-slate">{b.change.ownersOnly}</p>
        )}
      </Panel>

      <FormAlert tone="info">{b.noPayments}</FormAlert>
    </div>
  );
}
