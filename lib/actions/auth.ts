"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { siteConfig } from "@/config/site";
import { authErrorKey } from "@/lib/auth/errors";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { workspaceSetupPath } from "@/lib/auth/workspace-setup";
import { DEFAULT_COUNTRY } from "@/lib/i18n/country-packs";
import { localizePath } from "@/lib/i18n/paths";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { findBetaInvite } from "@/lib/waitlist/invite";
import { WAITLIST_MODE } from "@/lib/waitlist/mode";
import {
  forgotPasswordSchema,
  inviteSignUpSchema,
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
  const { email, password, fullName, vertical, country } = parsed.data;
  // A personal beta link from the WazaBolt team: valid, and for this very email (checked here, not just on the page).
  const betaToken = typeof input === "object" && input !== null && "betaToken" in input ? (input as { betaToken: unknown }).betaToken : undefined;
  const admin = betaToken !== undefined ? createAdminClient() : null;
  const beta = admin ? await findBetaInvite(admin, betaToken) : null;
  if (betaToken !== undefined && (!beta || beta.email !== email)) return { ok: false, error: "invite_invalid" };
  // Beta waitlist mode: sign-up is closed except with a beta link (team invitation links still work: signUpWithInvite).
  if (WAITLIST_MODE && !beta) return { ok: false, error: "signup_disabled" };
  const locale = await getRequestLocale(localeInput);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // After confirming, the workspace setup screen, with the business type (and country) the visitor came with.
      emailRedirectTo: confirmUrl(localizePath(locale, workspaceSetupPath({ vertical, country }))),
      // Read by the sign-up trigger (profile only: setup "later") and the email templates. The vertical and
      // country are kept on the account too, so any later way of signing in still lands on the right setup.
      data: { full_name: fullName, locale, setup: "later", ...(vertical ? { vertical } : {}), ...(country ? { country_code: country } : {}) },
    },
  });
  if (error) {
    logServerError("auth.signUp", error);
    return { ok: false, error: authErrorKey(error) };
  }
  // The beta link is used up (an account exists for this email now, or did already).
  if (admin && beta) {
    const { error: used } = await admin.from("waitlist_leads").update({ joined_at: new Date().toISOString() }).eq("id", beta.id);
    if (used) logServerError("auth.signUp.beta", used);
  }
  // Same response whether or not the email was already registered.
  return { ok: true, email };
}

const inviteSignUpWithToken = inviteSignUpSchema.extend({ token: z.string().min(16).max(128) });

/**
 * Sign-up from an invitation link: the email is the invited one (never typed),
 * and the sign-up trigger adds the person to the inviting business instead of
 * creating a new one.
 */
export async function signUpWithInvite(input: unknown, localeInput?: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = inviteSignUpWithToken.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { fullName, password, token } = parsed.data;
  const locale = await getRequestLocale(localeInput);

  const supabase = await createClient();
  const { data: invite } = await supabase.rpc("get_invitation", { p_token: token }).maybeSingle();
  if (!invite || invite.state !== "pending") return { ok: false, error: "invite_invalid" };

  const { error } = await supabase.auth.signUp({
    email: invite.email,
    password,
    options: {
      emailRedirectTo: confirmUrl(localizePath(locale, "/dashboard")),
      data: { full_name: fullName, invite_token: token, locale, country_code: DEFAULT_COUNTRY },
    },
  });
  if (error) {
    logServerError("auth.signUpWithInvite", error);
    return { ok: false, error: authErrorKey(error) };
  }
  return { ok: true, email: invite.email };
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
