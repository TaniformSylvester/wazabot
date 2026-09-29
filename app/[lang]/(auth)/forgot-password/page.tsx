import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const generateMetadata = () => pageMetadata("forgotPassword", "/forgot-password", { index: false });

export default async function ForgotPasswordPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const a = t.auth;
  const configured = isSupabaseConfigured();
  return (
    <AuthCard
      title={a.forgot.title}
      description={a.forgot.description}
      footer={
        <>
          {a.forgot.remembered}{" "}
          <Link href={localizePath(locale, "/login")} className="font-semibold text-waza-700 hover:underline">
            {a.forgot.backToLogin}
          </Link>
        </>
      }
    >
      {!configured ? <NotConfiguredNotice text={a.notConfigured} /> : null}
      <ForgotPasswordForm disabled={!configured} />
    </AuthCard>
  );
}
