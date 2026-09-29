import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you use for WazaBolt and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-waza-700 hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      {!configured ? <NotConfiguredNotice /> : null}
      <ForgotPasswordForm disabled={!configured} />
    </AuthCard>
  );
}
