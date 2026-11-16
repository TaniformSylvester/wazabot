import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { RegisterForm } from "@/components/auth/register-form";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { format } from "@/lib/i18n/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { betaInviteState } from "@/lib/waitlist/invite";
import { WAITLIST_MODE, waitlistHref } from "@/lib/waitlist/mode";
import { SIGNUP_COUNTRIES, type SignupCountry, businessTypeFromVertical } from "@/lib/validation/auth-rules";

export const generateMetadata = () => pageMetadata("register", "/register", { index: false });

export default async function RegisterPage({ searchParams }: PageProps<"/[lang]/register">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  // A personal beta link from the WazaBolt team (?beta=…): sign-up for that lead's email, even while the waitlist is on.
  const admin = typeof sp.beta === "string" ? createAdminClient() : null;
  const betaState = admin ? await betaInviteState(admin, sp.beta) : null;
  const beta = betaState?.state === "valid" ? betaState.invite : null;
  const w = t.waitlist.invite;
  // The link was used: the account exists (also what the page shows right after signing up with it).
  if (betaState?.state === "used") {
    return (
      <AuthCard title={t.auth.register.checkEmailTitle} description="">
        <FormAlert tone="success">
          <span data-testid="beta-used">{format(w.used, { business: betaState.invite.business_name, email: betaState.invite.email })}</span>
        </FormAlert>
        <Link href={localizePath(locale, "/login")} className="mt-4 inline-block font-semibold text-waza-700 hover:underline">
          {t.auth.register.login}
        </Link>
      </AuthCard>
    );
  }
  // Beta waitlist mode: sign-up is closed; the waitlist form instead, with the same vertical (an unusable beta link says so).
  if (WAITLIST_MODE && !beta) {
    if (typeof sp.beta !== "string") redirect(waitlistHref(locale, sp.vertical ?? sp.type));
    return (
      <AuthCard title={t.auth.register.title} description="">
        <FormAlert tone="error">
          <span data-testid="beta-invalid">{w.invalid}</span>
        </FormAlert>
        <Link href={localizePath(locale, "/login")} className="mt-4 inline-block font-semibold text-waza-700 hover:underline">
          {t.auth.register.login}
        </Link>
      </AuthCard>
    );
  }
  // ?vertical= from the home page's tabs (shop, restaurant, school); ?type= from older links and other pages. A beta link brings the lead's own.
  const vertical = businessTypeFromVertical(beta?.vertical) ?? businessTypeFromVertical(sp.vertical) ?? businessTypeFromVertical(sp.type);
  // ?country= from a country page (/countries/nigeria → NG): that country is chosen.
  const country = beta?.country_code ?? (typeof sp.country === "string" ? sp.country.toUpperCase() : "");
  const defaultCountry = (SIGNUP_COUNTRIES as readonly string[]).includes(country) ? (country as SignupCountry) : undefined;
  const a = t.auth;
  const configured = isSupabaseConfigured();
  return (
    <AuthCard
      title={a.register.title}
      description={a.register.description}
      footer={
        <>
          {a.register.haveAccount}{" "}
          <Link href={localizePath(locale, "/login")} className="font-semibold text-waza-700 hover:underline">
            {a.register.login}
          </Link>
        </>
      }
    >
      {!configured ? <NotConfiguredNotice text={a.notConfigured} /> : null}
      {beta ? (
        <p className="mb-4 rounded-2xl bg-mint px-4 py-3 text-sm text-deep" data-testid="beta-note">
          {format(w.registerNote, { business: beta.business_name })}
        </p>
      ) : null}
      <RegisterForm disabled={!configured} vertical={vertical} country={defaultCountry} beta={beta ? { token: sp.beta as string, email: beta.email } : undefined} />
    </AuthCard>
  );
}
