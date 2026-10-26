import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { PLANS } from "@/config/economics";
import { format } from "@/lib/i18n/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SIGNUP_BUSINESS_TYPES, type SignupBusinessType } from "@/lib/validation/auth";

/** ?type= from the marketing pages: the business type itself, or a solutions page slug (schools, restaurants). */
const TYPE_ALIASES: Record<string, SignupBusinessType> = { schools: "school", restaurants: "restaurant", shops: "retail", shop: "retail" };

export const generateMetadata = () => pageMetadata("register", "/register", { index: false });

export default async function RegisterPage({ searchParams }: PageProps<"/[lang]/register">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const requested = typeof sp.type === "string" ? sp.type : "";
  const defaultType = (SIGNUP_BUSINESS_TYPES as readonly string[]).includes(requested) ? (requested as SignupBusinessType) : TYPE_ALIASES[requested];
  const a = t.auth;
  const configured = isSupabaseConfigured();
  return (
    <AuthCard
      title={a.register.title}
      description={format(a.register.description, { count: PLANS.find((p) => p.id === "free")?.aiConversationsPerMonth ?? 0 })}
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
      <RegisterForm disabled={!configured} defaultType={defaultType} />
    </AuthCard>
  );
}
