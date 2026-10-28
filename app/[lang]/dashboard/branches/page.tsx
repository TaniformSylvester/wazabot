import { MapPin } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { PageHeader, Panel, StatusBadge, formatMoney } from "@/components/app/ui";
import { requestExtraBranches, saveBranch, setBranchActive } from "@/lib/actions/branches";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { listBranches } from "@/lib/branches";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.branches.title);

/**
 * Locations of the business. Products, prices and customers are shared; each
 * branch has its own stock, sales and team. The plan sets how many can be
 * open (Business 2, Pro 5, plus paid extra branches; others 1).
 */
export default async function BranchesPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/branches"));
  const db = await createClient();
  const [branches, allowance, sub, request] = await Promise.all([
    listBranches(business.id),
    db.rpc("branch_allowance", { p_business_id: business.id }),
    db.from("subscriptions").select("extra_branches, plans(name, included_branches, extra_branch_price, currency)").eq("business_id", business.id).maybeSingle(),
    db.from("plan_change_requests").select("extra_branches, created_at").eq("business_id", business.id).eq("status", "pending").eq("kind", "branches").maybeSingle(),
  ]);
  const d = t.dashboard;
  const br = d.branches;
  const canEdit = canManageBusiness(business.role);
  const allowed = allowance.data ?? 1;
  const open = branches.filter((b) => b.active).length;
  const plan = sub.data?.plans;
  const extra = sub.data?.extra_branches ?? 0;
  const extraPrice = plan?.extra_branch_price === null || plan?.extra_branch_price === undefined ? null : Number(plan.extra_branch_price);
  const formText = { errors: d.errors, saved: br.saved, saving: d.common.saving };

  const fields = (b?: (typeof branches)[number]) => (
    <>
      <TextField name="name" label={br.fields.name} defaultValue={b?.name ?? ""} required maxLength={80} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="address" label={br.fields.address} defaultValue={b?.address ?? ""} maxLength={300} />
        <TextField name="city" label={br.fields.city} defaultValue={b?.city ?? ""} maxLength={80} />
        <TextField name="phone" label={br.fields.phone} type="tel" inputMode="tel" defaultValue={b?.phone ?? ""} maxLength={40} />
        <TextField name="hours" label={br.fields.hours} placeholder={br.fields.hoursPlaceholder} defaultValue={b?.hours ?? ""} maxLength={300} />
      </div>
    </>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={br.title} description={br.description} />

      <Panel title={br.plan.title}>
        <p className="text-sm text-deep" data-testid="branch-allowance">
          {format(br.plan.usage, { open: formatNumber(open, locale), allowed: formatNumber(allowed, locale), plan: plan?.name ?? "" })}
        </p>
        <p className="mt-1 text-sm text-slate">
          {extraPrice !== null
            ? format(br.plan.extraInfo, { included: formatNumber(plan?.included_branches ?? 1, locale), price: formatMoney(extraPrice, plan?.currency ?? business.currency, locale), extra: formatNumber(extra, locale) })
            : br.plan.upgradeInfo}
        </p>
        {request.data ? (
          <FormAlert tone="info" className="mt-3">
            {format(br.plan.pending, { count: formatNumber(request.data.extra_branches ?? 0, locale) })}
          </FormAlert>
        ) : null}
        {canEdit && extraPrice !== null ? (
          <ActionForm action={requestExtraBranches} text={{ ...formText, saved: br.plan.sent }} successMessage={br.plan.sent} className="mt-4 max-w-xl">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="extra" label={br.plan.extraLabel} type="number" min={0} max={100} defaultValue={String(Math.max(extra + 1, request.data?.extra_branches ?? 0))} hint={br.plan.extraHint} />
              <TextField name="contact_phone" label={d.billing.change.phone} type="tel" inputMode="tel" maxLength={40} defaultValue={business.phone ?? ""} />
            </div>
            <div>
              <SubmitButton>{br.plan.submit}</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Panel>

      <ul className="flex flex-col gap-4" data-testid="branch-list">
        {branches.map((b) => (
          <li key={b.id}>
            <Panel
              title={b.name}
              actions={
                <div className="flex items-center gap-2">
                  {b.isMain ? <StatusBadge tone="green">{br.main}</StatusBadge> : null}
                  {!b.active ? <StatusBadge tone="amber">{br.paused}</StatusBadge> : null}
                  {canEdit && !b.isMain ? (
                    <ActionButton action={setBranchActive.bind(null, b.id, !b.active)} errors={d.errors} pendingLabel={d.common.saving} confirm={b.active ? br.pauseConfirm : undefined}>
                      {b.active ? br.pause : br.reopen}
                    </ActionButton>
                  ) : null}
                </div>
              }
            >
              {canEdit ? (
                <ActionForm action={saveBranch} text={formText} successMessage={br.saved} hidden={{ id: b.id }}>
                  {fields(b)}
                  <div>
                    <SubmitButton variant="outline">{d.common.save}</SubmitButton>
                  </div>
                </ActionForm>
              ) : (
                <p className="flex items-start gap-2 text-sm text-slate">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {[b.address, b.city, b.phone, b.hours].filter(Boolean).join(" · ") || "—"}
                </p>
              )}
            </Panel>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <Panel id="new-branch" title={br.add}>
          {open < allowed ? (
            <ActionForm action={saveBranch} text={formText} successMessage={br.added} resetOnSuccess>
              {fields()}
              <div>
                <SubmitButton>{br.addSubmit}</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-slate" data-testid="branch-limit">
              {extraPrice !== null ? br.limitExtra : br.limitUpgrade}
            </p>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
