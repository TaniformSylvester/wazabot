"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { siteConfig } from "@/config/site";
import { authErrorKey } from "@/lib/auth/errors";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { DEFAULT_COUNTRY } from "@/lib/i18n/country-packs";
import { localizePath } from "@/lib/i18n/paths";
import { getRequestLocale } from "@/lib/i18n/request-locale";
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

const NOT_CONFIGURED: ActionResult = { ok: false, error: "not_configured" };

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, error: "invalid_form", fieldErrors: z.flattenError(error).fieldErrors };
}

function confirmUrl(next: string) {
  return `${siteConfig.url}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export async function signUp(input: unknown, localeInput?: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { email, password, fullName, businessName } = parsed.data;
  const locale = await getRequestLocale(localeInput);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmUrl(localizePath(locale, "/dashboard")),
      // Read by the sign-up trigger (dashboard language, country pack) and the email templates.
      data: { full_name: fullName, business_name: businessName, locale, country_code: DEFAULT_COUNTRY },
    },
  });
  if (error) {
    logServerError("auth.signUp", error);
    return { ok: false, error: authErrorKey(error) };
  }
  // Same response whether or not the email was already registered.
  return { ok: true, email };
}

export async function signIn(input: unknown, next?: string, localeInput?: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const locale = await getRequestLocale(localeInput);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code !== "invalid_credentials") logServerError("auth.signIn", error);
    return { ok: false, error: authErrorKey(error) };
  }
  redirect(safeRedirectPath(next, localizePath(locale, "/dashboard")));
}

export async function requestPasswordReset(input: unknown, localeInput?: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const locale = await getRequestLocale(localeInput);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmUrl(localizePath(locale, "/reset-password")),
  });
  if (error) {
    logServerError("auth.resetPasswordForEmail", error);
    // Rate limits are worth surfacing; anything else gets the neutral answer.
    if (error.status === 429) return { ok: false, error: authErrorKey(error) };
  }
  // Never reveal whether the email has an account.
  return { ok: true, email: parsed.data.email };
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "reset_expired" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logServerError("auth.updateUser", error);
    return { ok: false, error: authErrorKey(error) };
  }
  return { ok: true };
}

/** Bind the locale when used as a form action: `signOut.bind(null, locale)`. */
export async function signOut(localeInput?: string) {
  const locale = await getRequestLocale(localeInput);
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect(`${localizePath(locale, "/login")}?message=signed_out`);
}
