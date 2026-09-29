import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const generateMetadata = () => pageMetadata("register", "/register", { index: false });

export default async function RegisterPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
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
      <RegisterForm disabled={!configured} />
    </AuthCard>
  );
}
