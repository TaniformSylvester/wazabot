import { Check, Minus } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { PageHeader, Panel, StatusBadge, TableWrap, formatDate, formatMoney, td, th } from "@/components/app/ui";
import { periodPrice } from "@/config/economics";
import { cancelPlanChange, requestPlanChange } from "@/lib/actions/billing";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getBilling, getPlanLimits } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

export const generateMetadata = dashboardMetadata((d) => d.billing.title);

/**
 * Plans come from the `plans` table (configurable). Prepaid, monthly or
 * yearly. No payment is processed here: owners/admins request a plan or a
 * renewal; the WazaBolt team approves it once paid.
 */
export default async function BillingPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/billing"));
  const [{ plans, subscription, usage, pendingRequest, payments }, limits] = await Promise.all([getBilling(business.id), getPlanLimits(business.id)]);
  const b = t.dashboard.billing;
  const pf = t.pricing.features;
  const d = t.dashboard;
  const canRequest = hasRole(business.role, "admin");
  const current = subscription?.plans ?? null;
  const limit = usage?.limit ?? current?.ai_conversations_per_month ?? 0;
  const aiConversationsUsed = usage?.used ?? 0;
  const usedPct = limit ? Math.min(100, (aiConversationsUsed / limit) * 100) : 0;
  const requestedPlan = pendingRequest ? plans.find((p) => p.id === pendingRequest.to_plan_id) : null;
  const formText = { errors: d.errors, saved: b.change.sent, saving: b.change.sending };
  const statusLabel = subscription ? (b.status[subscription.status as keyof typeof b.status] ?? subscription.status) : null;
  const interval = subscription?.billing_interval === "year" ? "year" : "month";
  const paid = Number(current?.monthly_price ?? 0) > 0;
  const billing = usage?.billing;
  const renewing = billing?.state === "renew_soon" || billing?.state === "payment_due";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={b.title} description={b.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={b.currentPlan}>
          {current && subscription ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-display text-2xl font-bold text-deep">{current.name}</p>
                {statusLabel ? <StatusBadge tone={subscription.status === "past_due" ? "amber" : "green"}>{statusLabel}</StatusBadge> : null}
              </div>
              <p className="text-sm text-slate">
                {formatMoney(periodPrice(Number(current.monthly_price), interval), current.currency, locale)}
                {interval === "year" ? b.perYear : b.perMonth}
              </p>
              {paid && billing ? (
                <p className={cn("text-sm font-semibold", billing.state === "active" ? "text-slate" : "text-coral-700")} data-testid="billing-state">
                  {billing.state === "payment_due"
                    ? format(b.paymentDue, { date: formatDate(billing.graceUntil, locale) })
                    : billing.state === "renew_soon"
                      ? format(b.endsSoon, { date: formatDate(subscription.current_period_end, locale) })
                      : format(b.paidUntil, { date: formatDate(subscription.current_period_end, locale) })}
                </p>
              ) : null}
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
          <p className="mt-2 text-xs text-slate">
            {usage?.counting === "windows"
              ? format(b.usageNoteWindows, { start: formatDate(usage.periodStart, locale), end: formatDate(new Date(new Date(usage.periodEnd).getTime() - 1).toISOString(), locale) })
              : b.usageNote}
          </p>
          {usage?.counting === "legacy" ? <p className="mt-2 text-xs font-semibold text-deep">{format(b.usageNoteLegacy, { date: formatDate(usage.rulesFrom, locale) })}</p> : null}
        </Panel>
      </div>

      {limits && (limits.maxProducts !== null || limits.maxMonthlySales !== null || limits.maxMembers !== null) ? (
        <Panel title={d.plan.usage.title} description={!limits.enforced && limits.limitsFrom ? format(d.plan.grace, {
          date: formatDate(`${limits.limitsFrom}T12:00:00Z`, locale),
          products: formatNumber(limits.maxProducts ?? 0, locale),
          sales: formatNumber(limits.maxMonthlySales ?? 0, locale),
          price: formatMoney(Number(plans.find((x) => x.id === "boutique")?.monthly_price ?? 0), business.currency, locale),
        }) : undefined}>
          <dl className="grid gap-3 sm:grid-cols-3" data-testid="plan-usage">
            {(
              [
                [d.plan.usage.products, limits.productsUsed, limits.maxProducts],
                [d.plan.usage.sales, limits.salesThisMonth, limits.maxMonthlySales],
                [d.plan.usage.members, limits.membersUsed, limits.maxMembers],
              ] as const
            ).map(([label, used, max]) => {
              const full = limits.enforced && max !== null && used >= max;
              return (
                <div key={label} className="rounded-2xl bg-surface p-4">
                  <dt className="text-sm text-slate">{label}</dt>
                  <dd className={cn("mt-1 font-display text-xl font-bold", full ? "text-coral-700" : "text-deep")}>
                    {max === null ? format(d.plan.usage.unlimited, { used: formatNumber(used, locale) }) : format(d.plan.usage.of, { used: formatNumber(used, locale), max: formatNumber(max, locale) })}
                  </dd>
                  {max !== null ? (
                    <div className="mt-2 h-1.5 rounded-full bg-border">
                      <div className={cn("h-1.5 rounded-full", full ? "bg-coral-600" : "bg-waza-600")} style={{ width: `${Math.min(100, Math.round((used / max) * 100))}%` }} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </dl>
        </Panel>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {plans.map((p) => {
          const isCurrent = subscription?.plan_id === p.id;
          const price = Number(p.monthly_price);
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
                {formatMoney(price, p.currency, locale)}
                <span className="text-sm font-normal text-slate">{b.perMonth}</span>
              </p>
              {price > 0 ? <p className="text-xs text-slate">{format(b.annualOffer, { price: formatMoney(periodPrice(price, "year"), p.currency, locale) })}</p> : null}
              <p className="mt-2 text-sm text-slate">{p.ai_conversations_per_month > 0 ? format(b.conversations, { count: formatNumber(p.ai_conversations_per_month, locale) }) : t.pricing.noAi}</p>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {[
                  { label: p.max_products === null ? pf.productsUnlimited : format(pf.products, { count: formatNumber(p.max_products, locale) }), on: true },
                  { label: p.max_monthly_sales === null ? pf.salesUnlimited : format(pf.sales, { count: formatNumber(p.max_monthly_sales, locale) }), on: true },
                  { label: format(p.max_members === 1 ? pf.members : pf.membersPlural, { count: formatNumber(p.max_members ?? 0, locale) }), on: p.max_members !== null },
                  { label: p.report_days === null ? pf.reportsFull : format(pf.reportsDays, { count: formatNumber(p.report_days, locale) }), on: true },
                  { label: pf.profit, on: p.has_profit },
                ]
                  .filter((f) => f.on || f.label === pf.profit)
                  .map((f) => (
                    <li key={f.label} className={cn("flex items-start gap-2", !f.on && "text-slate/70")}>
                      {f.on ? <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden /> : <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />}
                      {f.label}
                    </li>
                  ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {pendingRequest ? (
        <Panel title={b.pending.title}>
          <p className="text-sm text-slate">
            {format(b.pending.text, {
              plan: requestedPlan?.name ?? pendingRequest.to_plan_id,
              interval: b.interval[pendingRequest.billing_interval === "year" ? "year" : "month"],
              date: formatDate(pendingRequest.created_at, locale),
            })}
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

      <Panel id="change-plan" title={b.change.title} description={b.change.description}>
        {canRequest ? (
          <ActionForm action={requestPlanChange} text={formText} successMessage={b.change.sent} className="max-w-xl">
            <SelectField
              name="plan_id"
              label={b.change.plan}
              defaultValue={
                pendingRequest?.to_plan_id ?? (renewing ? subscription?.plan_id : plans.find((p) => p.id !== subscription?.plan_id && p.monthly_price > (current?.monthly_price ?? 0))?.id)
              }
              options={plans
                // A paid plan can be renewed; Free needs no request.
                .filter((p) => p.id !== subscription?.plan_id || Number(p.monthly_price) > 0)
                .map((p) => ({
                  value: p.id,
                  label: p.id === subscription?.plan_id ? format(b.change.renewOption, { plan: p.name }) : `${p.name} — ${formatMoney(p.monthly_price, p.currency, locale)}${b.perMonth}`,
                }))}
            />
            <SelectField
              name="billing_interval"
              label={b.change.billing}
              defaultValue={pendingRequest?.billing_interval ?? interval}
              options={[
                { value: "month", label: b.change.monthly },
                { value: "year", label: b.change.yearly },
              ]}
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

      {canRequest ? (
        <Panel id="payments" title={b.payments.title}>
          {payments.length ? (
            <TableWrap>
              <thead>
                <tr>
                  {[b.payments.date, b.payments.plan, b.payments.amount, b.payments.period, b.payments.reference].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className={td}>{formatDate(p.created_at, locale)}</td>
                    <td className={td}>
                      {plans.find((x) => x.id === p.plan_id)?.name ?? p.plan_id} ({b.interval[p.billing_interval === "year" ? "year" : "month"]})
                    </td>
                    <td className={td}>{formatMoney(p.amount, p.currency, locale)}</td>
                    <td className={td}>
                      {formatDate(p.period_start, locale)} – {formatDate(p.period_end, locale)}
                    </td>
                    <td className={td}>{p.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-slate">{b.payments.none}</p>
          )}
        </Panel>
      ) : null}

      <FormAlert tone="info">{b.noPayments}</FormAlert>
    </div>
  );
}
