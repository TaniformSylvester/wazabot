import { redirect } from "next/navigation";
import { permissionsFor } from "@/lib/auth/permissions";
import { Bot, Check, Minus } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, CheckboxField, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { PageHeader, Panel, StatusBadge, TableWrap, formatDate, td, th } from "@/components/app/ui";
import { UsageMeter } from "@/components/app/usage-meter";
import { planFeatures, restaurantPlanFeatures, schoolPlanFeatures } from "@/components/marketing/pricing-card";
import { addons, aiTopup, bundles, plans } from "@/config/plans";
import { cancelPlanChange, requestAiTopup, requestPlanChange, startAiTrial } from "@/lib/actions/billing";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { currentPlanId, getLimit, trialDaysLeft } from "@/lib/billing/entitlements";
import { getUsdBankDetails } from "@/lib/billing/bank-details";
import { getPlanAccess } from "@/lib/billing/plan-access";
import { planNameFor } from "@/lib/billing/plan-names";
import { catalog, catalogFor, planCurrencyFor, quote } from "@/lib/billing/price";
import { getBilling, getEntitlements } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatAmount, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { getBusinessModules } from "@/lib/modules";
import { cn } from "@/lib/utils";

export const generateMetadata = dashboardMetadata((d) => d.billing.title);

/**
 * The business's plan (config/economics.ts prices), its AI add-on and how to
 * pay. Prepaid, monthly or yearly; no payment is processed here: owners and
 * admins ask for a plan, the WazaBolt team takes Mobile Money and approves it.
 * The AI assistant is "coming soon" until the WazaBolt team launches it.
 */
export default async function BillingPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/billing"));
  // Billing is for owners and managers. Staff of a business still waiting for its plan only learn that the owner is on it.
  if (!permissionsFor(business.role).canViewRevenue) {
    if (!business.awaitingPaidPlan) redirect(localizePath(locale, "/dashboard"));
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title={t.dashboard.billing.title} />
        <FormAlert tone="info">
          <span data-testid="billing-staff">{t.dashboard.billing.awaitingPlan.staff}</span>
        </FormAlert>
      </div>
    );
  }
  const [{ usage, pendingRequest, payments }, access, ent, modules] = await Promise.all([
    getBilling(business.id),
    getPlanAccess(business.id),
    getEntitlements(business.id),
    getBusinessModules(business),
  ]);
  const b = t.dashboard.billing;
  const d = t.dashboard;
  const pt = t.pricing;
  const canRequest = hasRole(business.role, "admin");
  const formText = { errors: d.errors, saved: b.change.sent, saving: b.change.sending };
  const planId = access ? currentPlanId(access.planId) : "free";
  const noPlan = planId === "free";
  // A school sees the plans under their school names (School Starter, School Standard, School Plus).
  const schoolNames = modules.includes("school");
  const nameOf = (id: keyof typeof pt.plans) => planNameFor(id, pt.plans[id].name, schoolNames, locale);
  const planName = nameOf(planId);
  const addonName = access?.addonId ? pt.ai.addons[access.addonId].name : null;
  // Prices in the business's currency when WazaBolt sells in it (USD: plans only); otherwise FCFA, and the team agrees the price.
  const local = catalogFor(business.currency);
  const cat = local ?? catalog;
  const priceCurrency = local ? planCurrencyFor(business.currency) : "XAF";
  const fcfaOnly = priceCurrency === "XAF";
  const shownPlans = plans
    .filter((p) => cat.plans.some((x) => x.id === p.id))
    .map((p) => ({ ...p, monthlyPrice: cat.plans.find((x) => x.id === p.id)!.monthlyPrice, extraBranchPrice: fcfaOnly ? p.extraBranchPrice : null }));
  const shownAddons = fcfaOnly ? addons : [];
  // Where to send dollars (set by the WazaBolt team): owners and admins of businesses paying in dollars only.
  const bank = !fcfaOnly && priceCurrency === "USD" && canRequest ? await getUsdBankDetails() : null;
  const addonId = access?.addonId && cat.addons.some((a) => a.id === access.addonId) ? access.addonId : null;
  const now = quote(noPlan || !cat.plans.some((p) => p.id === planId) ? "business" : planId, addonId, access?.interval ?? "month", cat);
  const trialLeft = access ? trialDaysLeft(access) : null;
  const state = usage?.billing.state;
  const aiLaunched = access?.aiLaunched ?? false;
  const users = access ? getLimit(access, "members") : null;
  const shops = access ? getLimit(access, "shops") : null;
  const statusKey = noPlan ? "none" : (access?.status ?? "active");
  const money = (v: number) => formatAmount(v, priceCurrency, locale);
  const fcfa = (v: number) => formatAmount(v, "XAF", locale);
  const pendingPlan = pendingRequest ? plans.find((p) => p.id === pendingRequest.to_plan_id) : null;
  const aiTrialUsed = !!access?.aiTrial.startedAt;
  // A school or a restaurant sees the plans in its own terms (students and teachers; kitchen accounts and tables).
  const isSchool = modules.includes("school");
  const isRestaurant = !isSchool && modules.includes("restaurant");
  const features = isSchool ? schoolPlanFeatures : isRestaurant ? restaurantPlanFeatures : planFeatures;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={b.title} description={b.description} />
      {business.awaitingPaidPlan ? (
        <FormAlert tone="info" className="text-base">
          <p className="font-semibold" data-testid="awaiting-plan">
            {b.awaitingPlan.title}
          </p>
          <p className="mt-1">{b.awaitingPlan.text}</p>
          {!pendingRequest ? <p className="mt-1 font-semibold">{b.awaitingPlan.noRequest}</p> : null}
        </FormAlert>
      ) : null}

      {business.currency !== "XAF" ? (
        <div data-testid="other-country">
          <FormAlert tone="info">{local ? format(bank ? b.bankTransferShown : b.bankTransfer, { currency: priceCurrency }) : format(b.otherCountry, { currency: business.currency })}</FormAlert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={b.currentPlan}>
          <div className="flex flex-col gap-2" data-testid="current-plan">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-display text-2xl font-bold text-deep">{planName}</p>
              <StatusBadge tone={noPlan || statusKey === "past_due" ? "amber" : "green"}>{b.status[statusKey as keyof typeof b.status]}</StatusBadge>
            </div>
            {noPlan ? (
              <p className="text-sm text-coral-700" data-testid="billing-state">
                {b.noPlan}
              </p>
            ) : (
              <>
                <p className="text-sm text-slate">
                  {money(now.period)}
                  {now.interval === "year" ? b.perYear : b.perMonth}
                </p>
                <p className="text-sm text-slate">
                  {b.addon}: <span className="font-semibold text-deep">{addonName ?? b.addonNone}</span>
                </p>
                <p className={cn("text-sm font-semibold", state === "payment_due" || state === "renew_soon" ? "text-coral-700" : "text-slate")} data-testid="billing-state">
                  {state === "trial" && access
                    ? format(b.trialUntil, { date: formatDate(access.periodEnd, locale), days: formatNumber(trialLeft ?? 0, locale) })
                    : state === "payment_due"
                      ? format(b.paymentDue, { date: formatDate(usage?.billing.graceUntil ?? null, locale) })
                      : state === "renew_soon"
                        ? format(b.endsSoon, { date: formatDate(access?.periodEnd ?? null, locale) })
                        : format(b.paidUntil, { date: formatDate(access?.periodEnd ?? null, locale) })}
                </p>
              </>
            )}
            {access && access.setupFee.amount > 0 ? (
              <p className="text-sm text-slate" data-testid="setup-fee">
                {access.setupFee.paidAt ? b.setupFeePaid : format(b.setupFee, { price: fcfa(access.setupFee.amount) })}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title={b.usersShops}>
          <dl className="grid gap-3 sm:grid-cols-2" data-testid="plan-usage">
            {users ? <UsageMeter label={b.users} used={users.used} max={users.max} enforced locale={locale} text={d.plan.usage} /> : null}
            {shops ? <UsageMeter label={b.shops} used={shops.used} max={shops.max} enforced locale={locale} text={d.plan.usage} /> : null}
            {ent && modules.includes("school") ? <UsageMeter label={d.plan.usage.students} used={ent.studentsUsed} max={ent.maxStudents} enforced locale={locale} text={d.plan.usage} /> : null}
            {ent && modules.includes("restaurant") ? <UsageMeter label={d.plan.usage.kitchen} used={ent.kitchenUsed} max={ent.maxKitchen} enforced locale={locale} text={d.plan.usage} /> : null}
          </dl>
        </Panel>
      </div>

      <Panel title={b.ai.title}>
        <div className="flex flex-col gap-3" data-testid="ai-panel">
          {!aiLaunched ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate">
              <Bot className="size-4 text-waza-600" aria-hidden />
              <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-bold text-gold-800" data-testid="ai-coming-soon">
                {b.ai.comingSoon}
              </span>
              {b.ai.comingSoonText}
            </p>
          ) : usage && (usage.addonId || usage.aiTrial) ? (
            <>
              <p className="text-sm font-semibold text-deep">{usage.aiTrial ? format(b.ai.trialUsage, { used: formatNumber(usage.used, locale), limit: formatNumber(usage.limit, locale), date: formatDate(usage.periodEnd, locale) }) : b.ai.usage}</p>
              <p className="font-display text-2xl font-bold text-deep" data-testid="ai-usage">
                {format(b.ai.usageOf, { used: formatNumber(usage.used, locale), limit: formatNumber(usage.limit, locale) })}
              </p>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={usage.limit} aria-valuenow={usage.used} aria-label={b.ai.usage}>
                <div
                  className={cn("h-full rounded-full", usage.level === "reached" ? "bg-coral-600" : usage.level === "warning" ? "bg-gold" : "bg-waza-500")}
                  style={{ width: `${usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-slate">
                {format(b.ai.usageNote, { start: formatDate(usage.periodStart, locale), end: formatDate(new Date(new Date(usage.periodEnd).getTime() - 1).toISOString(), locale) })}
              </p>
              {canRequest && usage.addonId && fcfaOnly && !business.readOnly ? (
                <div>
                  <ActionButton action={requestAiTopup} pendingLabel={b.change.sending} errors={d.errors}>
                    {format(b.ai.topup, { price: money(aiTopup.price), count: formatNumber(aiTopup.conversations, locale) })}
                  </ActionButton>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-slate">{b.ai.none}</p>
              {canRequest && !aiTrialUsed && !noPlan ? (
                <ActionForm action={startAiTrial} text={{ errors: d.errors, saved: b.ai.trialStarted, saving: b.change.sending }} successMessage={b.ai.trialStarted} className="max-w-xl">
                  <p className="text-sm font-semibold text-deep">{b.ai.trialTitle}</p>
                  <p className="text-xs text-slate">{b.ai.trialText}</p>
                  <CheckboxField name="accept_meta_notice" label={b.metaNotice.label} description={b.metaNotice.hint} />
                  <div>
                    <SubmitButton>{b.ai.trialStart}</SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
            </>
          )}
        </div>
      </Panel>

      <ul className="grid gap-4 md:grid-cols-3">
        {shownPlans.map((p, i) => {
          const isCurrent = planId === p.id;
          return (
            <li key={p.id} className={cn("flex flex-col rounded-3xl border bg-card p-5 shadow-card", isCurrent ? "border-waza-500 ring-2 ring-waza-500/30" : "border-border")} data-testid={`billing-plan-${p.id}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-bold text-deep">{nameOf(p.id)}</p>
                {isCurrent ? (
                  <StatusBadge tone="green">
                    <Check className="size-3" aria-hidden /> {b.current}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="mt-3 font-display text-2xl font-bold text-deep">
                {money(p.monthlyPrice)}
                <span className="text-sm font-normal text-slate">{b.perMonth}</span>
              </p>
              <p className="text-xs text-slate">{format(b.annualOffer, { price: money(quote(p.id, null, "year", cat).period) })}</p>
              {isSchool && p.id !== "free" ? (
                <p className="mt-2 text-sm font-semibold text-deep" data-testid="school-plan-for">
                  {format(pt.school.plans[p.id], { count: formatNumber(p.maxStudents ?? 0, locale) })}
                </p>
              ) : isRestaurant && p.id !== "free" ? (
                <p className="mt-2 text-sm font-semibold text-deep" data-testid="restaurant-plan-for">
                  {format(pt.restaurant.plans[p.id], { count: formatNumber(p.includedBranches, locale) })}
                </p>
              ) : null}
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {features(p, i > 0 ? shownPlans[i - 1] : undefined, pt, locale).map((f) => (
                  <li key={f.label} className={cn("flex items-start gap-2", !f.included && "text-slate/70")}>
                    {f.included ? <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden /> : <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />}
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
          <p className="text-sm text-slate" data-testid="pending-request">
            {pendingRequest.kind === "branches"
              ? format(d.branches.plan.pending, { count: formatNumber(pendingRequest.extra_branches ?? 0, locale) })
              : pendingRequest.kind === "topup"
                ? format(b.pending.topup, { date: formatDate(pendingRequest.created_at, locale) })
                : format(b.pending.text, {
                    plan: [pendingPlan ? nameOf(pendingPlan.id) : pendingRequest.to_plan_id, pendingRequest.addon_id === "ai_basic" || pendingRequest.addon_id === "ai_plus" ? pt.ai.addons[pendingRequest.addon_id].name : null]
                      .filter(Boolean)
                      .join(" + "),
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

      {canRequest ? (
        <Panel id="how-to-pay" title={b.howToPay.title} description={b.howToPay.description}>
          <ol className="flex flex-col gap-3" data-testid="how-to-pay">
            {(fcfaOnly ? b.howToPay.xaf : b.howToPay.usd).map((step, i) => (
              <li key={step} className="flex gap-3 text-sm text-deep">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-mint text-xs font-bold text-waza-700">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-xs text-slate" data-testid="till-note">
            {fcfaOnly ? b.howToPay.tillXaf : b.howToPay.tillUsd}
          </p>
        </Panel>
      ) : null}

      {bank ? (
        <Panel id="bank-details" title={b.bankDetails.title} description={b.bankDetails.intro}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2" data-testid="bank-details">
            {[
              [b.bankDetails.beneficiary, bank.beneficiary],
              [b.bankDetails.bank, bank.bank],
              [b.bankDetails.bankAddress, bank.bankAddress],
              [b.bankDetails.swift, bank.swift],
              [b.bankDetails.account, bank.accountNumber],
              [b.bankDetails.accountType, bank.accountType],
              [b.bankDetails.reference, business.name],
              [b.bankDetails.routing, bank.routing ?? ""],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-slate">{label}</dt>
                  <dd className="font-semibold break-words text-deep select-all">{value}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-4 text-sm text-slate">{b.bankDetails.usdOnly}</p>
          <p className="mt-1 text-sm text-slate">{b.bankDetails.afterPaying}</p>
        </Panel>
      ) : null}

      <Panel id="change-plan" title={b.change.title} description={fcfaOnly ? b.change.description : b.change.descriptionBank}>
        {canRequest ? (
          <ActionForm action={requestPlanChange} text={formText} successMessage={b.change.sent} className="max-w-xl">
            <SelectField
              name="plan_id"
              label={b.change.plan}
              defaultValue={pendingPlan?.id ?? (noPlan ? "business" : planId)}
              options={shownPlans.map((p) => ({
                value: p.id,
                label: p.id === planId && !noPlan && access?.status !== "trialing" ? format(b.change.renewOption, { plan: nameOf(p.id) }) : `${nameOf(p.id)} — ${money(p.monthlyPrice)}${b.perMonth}`,
              }))}
            />
            <SelectField
              name="billing_interval"
              label={b.change.billing}
              defaultValue={pendingRequest?.billing_interval ?? access?.interval ?? "month"}
              options={[
                { value: "month", label: b.change.monthly },
                { value: "year", label: b.change.yearly },
              ]}
            />
            {aiLaunched && shownAddons.length ? (
              <>
                <SelectField
                  name="addon_id"
                  label={b.change.addon}
                  defaultValue={pendingRequest?.addon_id ?? access?.addonId ?? ""}
                  options={[
                    { value: "", label: b.change.addonNone },
                    ...shownAddons.map((a) => ({
                      value: a.id,
                      label: format(b.change.addonOption, { name: pt.ai.addons[a.id].name, price: money(a.monthlyPrice), count: formatNumber(a.conversationsPerMonth, locale) }),
                    })),
                  ]}
                />
                {bundles.map((x) => {
                  const plan = plans.find((p) => p.id === x.planId);
                  const addon = addons.find((a) => a.id === x.addonId);
                  return plan && addon ? (
                    <p key={`${x.planId}-${x.addonId}`} className="-mt-2 text-xs text-slate">
                      {format(b.change.bundleNote, { plan: nameOf(plan.id), addon: pt.ai.addons[addon.id].name, price: money(x.monthlyPrice), list: money(plan.monthlyPrice + addon.monthlyPrice) })}
                    </p>
                  ) : null;
                })}
                {/* Shown with the add-on, never at sign-up: Meta bills the business directly for some messages. */}
                {access?.metaNoticeAcceptedAt ? null : <CheckboxField name="accept_meta_notice" label={b.metaNotice.label} description={b.metaNotice.hint} />}
              </>
            ) : null}
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
                {payments.map((p) => {
                  const kind = p.kind === "topup" || p.kind === "setup_fee" ? p.kind : "plan";
                  const plan = currentPlanId(p.plan_id);
                  return (
                    <tr key={p.id}>
                      <td className={td}>{formatDate(p.created_at, locale)}</td>
                      <td className={td}>
                        {kind === "plan" ? `${nameOf(plan)}${p.addon_id === "ai_basic" || p.addon_id === "ai_plus" ? ` + ${pt.ai.addons[p.addon_id].name}` : ""} (${b.interval[p.billing_interval === "year" ? "year" : "month"]})` : b.payments.kinds[kind]}
                      </td>
                      <td className={td}>{formatAmount(Number(p.amount), p.currency ?? "XAF", locale)}</td>
                      <td className={td}>
                        {formatDate(p.period_start, locale)} – {formatDate(p.period_end, locale)}
                      </td>
                      <td className={td}>{p.reference ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-slate">{b.payments.none}</p>
          )}
        </Panel>
      ) : null}

      {business.currency === "XAF" ? <FormAlert tone="info">{b.noPayments}</FormAlert> : null}
    </div>
  );
}
