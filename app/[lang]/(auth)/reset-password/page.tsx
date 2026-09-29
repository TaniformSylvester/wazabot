import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/dal";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { rich } from "@/lib/i18n/rich";

export const generateMetadata = () => pageMetadata("resetPassword", "/reset-password", { index: false });

/** Reached from the password-reset email (via /auth/confirm, which signs the user in). */
export default async function ResetPasswordPage() {
  const [locale, t, user] = await Promise.all([getLocale(), getMessages(), getCurrentUser()]);
  const r = t.auth.reset;

  if (!user) {
    return (
      <AuthCard title={r.expiredTitle} description={r.expiredDescription}>
        <FormAlert tone="error" className="mb-6">
          {r.expiredText}
        </FormAlert>
        <Button asChild size="lg" className="w-full">
          <Link href={localizePath(locale, "/forgot-password")}>{r.requestNew}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={r.title}
      description={rich(r.forEmail.replace("{email}", user.email), { b: (c) => <strong className="text-deep">{c}</strong> })}
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
