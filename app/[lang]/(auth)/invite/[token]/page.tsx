import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInvite } from "@/components/auth/accept-invite";
import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { InviteSignUpForm } from "@/components/auth/invite-signup-form";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/dal";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { rich } from "@/lib/i18n/rich";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return { title: t.auth.invite.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * Invitation link (/invite/<secret>). Shows which business and role, then:
 * signed in with the invited email → join; signed in as someone else → log
 * out first; not signed in → create an account (or log in and come back).
 */
export default async function InvitePage({ params }: PageProps<"/[lang]/invite/[token]">) {
  const [locale, t, { token }] = await Promise.all([getLocale(), getMessages(), params]);
  const iv = t.auth.invite;
  const login = (c: React.ReactNode) => (
    <Link href={`${localizePath(locale, "/login")}?next=${encodeURIComponent(localizePath(locale, `/invite/${token}`))}`} className="font-semibold text-waza-700 hover:underline">
      {c}
    </Link>
  );

  if (!isSupabaseConfigured()) {
    return (
      <AuthCard title={iv.invalidTitle}>
        <NotConfiguredNotice text={t.auth.notConfigured} />
      </AuthCard>
    );
  }

  const supabase = await createClient();
  const { data: invite } = token.length >= 16 && token.length <= 128 ? await supabase.rpc("get_invitation", { p_token: token }).maybeSingle() : { data: null };

  if (!invite || invite.state !== "pending") {
    const state = (invite?.state ?? "invalid") as keyof typeof iv.states;
    return (
      <AuthCard title={iv.invalidTitle}>
        <p className="text-slate">{iv.states[state] ?? iv.states.invalid}</p>
        <Button asChild className="mt-6 w-full" variant="outline">
          <Link href={localizePath(locale, "/login")}>{iv.goToLogin}</Link>
        </Button>
      </AuthCard>
    );
  }

  const role = t.dashboard.header.roles[invite.role as keyof typeof t.dashboard.header.roles] ?? invite.role;
  const description = invite.inviter_name ? format(iv.description, { inviter: invite.inviter_name, role }) : format(iv.descriptionNoInviter, { role });
  const user = await getCurrentUser();

  if (user) {
    const matches = user.email.toLowerCase() === invite.email;
    return (
      <AuthCard title={format(iv.title, { business: invite.business_name })} description={description}>
        {matches ? (
          <AcceptInvite
            token={token}
            locale={locale}
            label={format(iv.accept, { business: invite.business_name })}
            pendingLabel={iv.accepting}
            errors={t.dashboard.errors}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-slate">{rich(format(iv.wrongAccount, { current: user.email, email: invite.email }), { b: (c) => <strong className="text-deep">{c}</strong> })}</p>
            <form action={signOut.bind(null, locale)}>
              <Button type="submit" variant="outline" className="w-full">
                {iv.logout}
              </Button>
            </form>
          </div>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={format(iv.title, { business: invite.business_name })}
      description={description}
      footer={
        <>
          {iv.haveAccount} {login(iv.login)}
        </>
      }
    >
      <InviteSignUpForm token={token} email={invite.email} submitLabel={iv.create} />
    </AuthCard>
  );
}
