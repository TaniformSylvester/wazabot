import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { plans } from "@/config/plans";
import { PageHeader, Panel } from "@/components/app/ui";
import { createBusiness } from "@/lib/actions/businesses";
import { listMyBusinesses, requireUser } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatAmount } from "@/lib/i18n/format";
import { catalogFor, planCurrencyFor } from "@/lib/billing/price";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";
import { SIGNUP_BUSINESS_TYPES } from "@/lib/validation/auth";

export const generateMetadata = dashboardMetadata((d) => d.newBusiness.title);

/**
 * Add another business under the same login. One Free business per owner:
 * when the user already owns one, the new business needs a paid plan (the
 * database function enforces this; the page only shows the plan picker).
 */
export default async function NewBusinessPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  // Not requireBusiness: someone with no business (or only a teacher seat) can start one too.
  const user = await requireUser(localizePath(locale, "/dashboard/businesses/new"));
  const db = await createClient();
  const [mine, owned] = await Promise.all([
    listMyBusinesses(),
    db.from("business_members").select("businesses(name, currency, created_at, needs_paid_plan, subscriptions(trial_started_at))").eq("user_id", user.id).eq("role", "owner"),
  ]);
  // One free trial per owner: once a business they own has had it, a new one needs a plan (create_business enforces it).
  const freeBusiness = (owned.data ?? []).map((m) => m.businesses).find((b) => b && b.subscriptions?.trial_started_at);
  // The new business takes the country (and currency) of the owner's latest business: its prices are in that currency when WazaBolt sells in it.
  const latest = (owned.data ?? []).map((m) => m.businesses).filter((x) => !!x).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  const local = latest ? catalogFor(latest.currency) : null;
  const priceCurrency = local ? planCurrencyFor(latest!.currency) : "XAF";
  const priced = plans.filter((p) => !local || local.plans.some((x) => x.id === p.id)).map((p) => ({ id: p.id, price: local?.plans.find((x) => x.id === p.id)?.monthlyPrice ?? p.monthlyPrice }));
  const nb = t.dashboard.newBusiness;
  const b = t.dashboard.billing;
  const a = t.auth.fields;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={nb.title} description={nb.description} />
      <Panel title={nb.title}>
        <ActionForm action={createBusiness} text={{ errors: t.dashboard.errors, saved: nb.creating, saving: nb.creating }} hidden={{ locale }} className="max-w-xl">
          <TextField name="name" label={nb.name} required minLength={2} maxLength={120} autoComplete="organization" />
          <SelectField
            name="type"
            label={nb.type}
            hint={nb.typeHint}
            defaultValue="retail"
            options={SIGNUP_BUSINESS_TYPES.map((v) => ({ value: v, label: a.businessTypes[v] }))}
          />
          {freeBusiness ? (
            <>
              <div className="rounded-2xl border border-gold/40 bg-gold-50 p-4 text-sm text-gold-800" data-testid="needs-paid-plan">
                <p className="font-semibold">{nb.paidTitle}</p>
                <p className="mt-1">{format(nb.paidText, { business: freeBusiness.name })}</p>
              </div>
              <SelectField
                name="plan_id"
                label={nb.plan}
                options={priced.map((p) => ({ value: p.id, label: `${t.pricing.plans[p.id].name} — ${formatAmount(p.price, priceCurrency, locale)}${b.perMonth}` }))}
              />
              <SelectField
                name="billing_interval"
                label={b.change.billing}
                defaultValue="month"
                options={[
                  { value: "month", label: b.change.monthly },
                  { value: "year", label: b.change.yearly },
                ]}
              />
              <TextField name="contact_phone" label={nb.phone} type="tel" inputMode="tel" autoComplete="tel" maxLength={40} />
            </>
          ) : null}
          <div>
            <SubmitButton>{nb.submit}</SubmitButton>
          </div>
        </ActionForm>
      </Panel>
      {mine.length ? (
        <Panel title={nb.yours}>
          <ul className="flex flex-col gap-1 text-sm text-deep">
            {mine.map((m) => (
              <li key={m.id}>
                {m.name} <span className="text-slate">· {t.dashboard.header.roles[m.role]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
