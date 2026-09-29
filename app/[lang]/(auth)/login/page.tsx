import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const generateMetadata = () => pageMetadata("login", "/login", { index: false });

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const [locale, t, params] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const a = t.auth;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const configured = isSupabaseConfigured();
  const errors: Record<string, string> = { link_invalid: a.login.linkInvalid };
  const messages: Record<string, string> = { signed_out: a.login.signedOut };
  const error = errors[one(params.error) ?? ""];
  const message = messages[one(params.message) ?? ""];

  return (
    <AuthCard
      title={a.login.title}
      description={a.login.description}
      footer={
        <>
          {a.login.newHere}{" "}
          <Link href={localizePath(locale, "/register")} className="font-semibold text-waza-700 hover:underline">
            {a.login.createAccount}
          </Link>
        </>
      }
    >
      {!configured ? <NotConfiguredNotice text={a.notConfigured} /> : null}
      {error ? <FormAlert tone="error" className="mb-6">{error}</FormAlert> : null}
      {message ? <FormAlert tone="success" className="mb-6">{message}</FormAlert> : null}
      <LoginForm next={safeRedirectPath(one(params.next), localizePath(locale, "/dashboard"))} disabled={!configured} />
    </AuthCard>
  );
}
