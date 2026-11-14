import { redirect } from "next/navigation";

import { ActionForm, RadioCards, SelectField, SubmitButton, TextField } from "@/components/app/form";
import { setupWorkspace } from "@/lib/actions/businesses";
import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/i18n/country-packs";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { SIGNUP_BUSINESS_TYPES, SIGNUP_COUNTRIES, businessTypeFromVertical } from "@/lib/validation/auth-rules";

export const generateMetadata = dashboardMetadata((d) => d.setup.title);

/**
 * The one-screen workspace setup after sign-up: business name, currency and
 * business type — pre-selected from ?vertical= (the home page's tab, carried
 * through the email confirmation) or from what the account signed up with.
 * Creating it opens the dashboard straight away.
 */
export default async function WorkspaceSetupPage({ searchParams }: PageProps<"/[lang]/dashboard/setup">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const user = await requireUser(localizePath(locale, "/dashboard/setup"));
  // Already has a business (set up, or joined one): nothing to set up here.
  if (await getCurrentBusiness()) redirect(localizePath(locale, "/dashboard"));

  const s = t.dashboard.setup;
  const type = businessTypeFromVertical(sp.vertical) ?? businessTypeFromVertical(user.signupVertical);
  const requestedCountry = (typeof sp.country === "string" ? sp.country : (user.signupCountry ?? "")).toUpperCase();
  const country = isCountryCode(requestedCountry) ? requestedCountry : DEFAULT_COUNTRY;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4 sm:py-8">
      <div>
        <h1 className="type-h2">{s.title}</h1>
        <p className="type-body mt-2 text-slate">{s.text}</p>
      </div>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <ActionForm action={setupWorkspace} text={{ errors: t.dashboard.errors, saved: s.creating, saving: s.creating }} hidden={{ locale }} successMessage={null}>
          <TextField name="name" label={type === "school" ? s.schoolName : s.businessName} autoComplete="organization" maxLength={120} required autoFocus />
          <SelectField
            name="currency"
            label={s.currency}
            hint={s.currencyHint}
            defaultValue={country}
            options={SIGNUP_COUNTRIES.map((c) => ({ value: c, label: s.currencies[c] }))}
            data-testid="setup-currency"
          />
          <div data-testid="setup-type" data-selected={type ?? ""}>
            <RadioCards
              name="type"
              label={s.type}
              columns={4}
              defaultValue={type}
              options={SIGNUP_BUSINESS_TYPES.map((k) => ({ value: k, label: s.types[k].label, description: s.types[k].description }))}
            />
            <p className="mt-2 text-xs text-slate">{s.typeHint}</p>
          </div>
          <div className="flex flex-col gap-2">
            <SubmitButton>{s.submit}</SubmitButton>
            <p className="text-xs text-slate">{s.trial}</p>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
