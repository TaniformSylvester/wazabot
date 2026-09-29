import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Log In", robots: { index: false } };

const errors: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please try again or request a new one.",
};
const messages: Record<string, string> = {
  signed_out: "You've been logged out.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const configured = isSupabaseConfigured();
  const error = errors[one(params.error) ?? ""];
  const message = messages[one(params.message) ?? ""];

  return (
    <AuthCard
      title="Welcome back"
      description="Log in to manage your WhatsApp business."
      footer={
        <>
          New to WazaBolt?{" "}
          <Link href="/register" className="font-semibold text-waza-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {!configured ? <NotConfiguredNotice /> : null}
      {error ? <FormAlert tone="error" className="mb-6">{error}</FormAlert> : null}
      {message ? <FormAlert tone="success" className="mb-6">{message}</FormAlert> : null}
      <LoginForm next={safeRedirectPath(one(params.next))} disabled={!configured} />
    </AuthCard>
  );
}
