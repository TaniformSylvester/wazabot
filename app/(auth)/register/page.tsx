import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Get Started", robots: { index: false } };

export default function RegisterPage() {
  const configured = isSupabaseConfigured();
  return (
    <AuthCard
      title="Get started with WazaBolt"
      description="Create your account — free for 50 AI conversations every month."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-waza-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {!configured ? <NotConfiguredNotice /> : null}
      <RegisterForm disabled={!configured} />
    </AuthCard>
  );
}
