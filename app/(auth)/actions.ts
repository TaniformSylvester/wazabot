"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { siteConfig } from "@/config/site";
import { authErrorMessage } from "@/lib/auth/errors";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { logServerError } from "@/lib/log";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ActionResult,
} from "@/lib/validation/auth";

const NOT_CONFIGURED: ActionResult = {
  ok: false,
  error: "Accounts aren't available yet — the authentication service hasn't been configured.",
};

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors };
}

function confirmUrl(next: string) {
  return `${siteConfig.url}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export async function signUp(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { email, password, fullName, businessName } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmUrl("/dashboard"),
      data: { full_name: fullName, business_name: businessName },
    },
  });
  if (error) {
    logServerError("auth.signUp", error);
    return { ok: false, error: authErrorMessage(error) };
  }
  // Same response whether or not the email was already registered.
  return { ok: true, message: email };
}

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code !== "invalid_credentials") logServerError("auth.signIn", error);
    return { ok: false, error: authErrorMessage(error) };
  }
  redirect(safeRedirectPath(next));
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmUrl("/reset-password"),
  });
  if (error) {
    logServerError("auth.resetPasswordForEmail", error);
    // Rate limits are worth surfacing; anything else gets the neutral answer.
    if (error.status === 429) return { ok: false, error: authErrorMessage(error) };
  }
  // Never reveal whether the email has an account.
  return { ok: true, message: parsed.data.email };
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "Your reset link has expired. Request a new one to continue." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logServerError("auth.updateUser", error);
    return { ok: false, error: authErrorMessage(error) };
  }
  return { ok: true, message: "Your password has been updated." };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/login?message=signed_out");
}
