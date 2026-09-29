import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** Reached from the password-reset email (via /auth/confirm, which signs the user in). */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AuthCard title="Link expired" description="Password reset links work once and expire after an hour.">
        <FormAlert tone="error" className="mb-6">
          We couldn&apos;t verify your reset link. Please request a new one.
        </FormAlert>
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description={<>For <strong className="text-deep">{user.email}</strong></>}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
