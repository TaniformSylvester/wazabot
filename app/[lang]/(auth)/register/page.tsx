import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SIGNUP_COUNTRIES, type SignupCountry, businessTypeFromVertical } from "@/lib/validation/auth-rules";

export const generateMetadata = () => pageMetadata("register", "/register", { index: false });

export default async function RegisterPage({ searchParams }: PageProps<"/[lang]/register">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  // ?vertical= from the home page's tabs (shop, restaurant, school); ?type= from older links and other pages.
  const vertical = businessTypeFromVertical(sp.vertical) ?? businessTypeFromVertical(sp.type);
  // ?country= from a country page (/countries/nigeria → NG): that country is chosen.
  const country = typeof sp.country === "string" ? sp.country.toUpperCase() : "";
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
      <RegisterForm disabled={!configured} vertical={vertical} country={defaultCountry} />
    </AuthCard>
  );
}
