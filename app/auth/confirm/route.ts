import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { workspaceSetupPath } from "@/lib/auth/workspace-setup";
import type { Locale } from "@/lib/i18n/config";
import { isCountryCode } from "@/lib/i18n/country-packs";
import { localizePath, splitLocale } from "@/lib/i18n/paths";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { logServerError } from "@/lib/log";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { SIGNUP_BUSINESS_TYPES, type SignupBusinessType } from "@/lib/validation/auth";
import { businessTypeFromVertical } from "@/lib/validation/auth-rules";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * The business type chosen on the sign-up form (user metadata "industry") is
 * set on the owner's new business the first time the email is confirmed, so
 * the right modules and setup steps are there from the first page. Only when
 * the business has no type yet: a type chosen later in Settings is never
 * overwritten. Errors are logged, never shown: the type can still be chosen
 * in the setup.
 */
async function applySignupBusinessType(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getUser();
  const industry = data.user?.user_metadata?.industry;
  if (!data.user || typeof industry !== "string" || !(SIGNUP_BUSINESS_TYPES as readonly string[]).includes(industry)) return;
  const { data: owned } = await supabase.from("business_members").select("business_id").eq("user_id", data.user.id).eq("role", "owner");
  const ids = (owned ?? []).map((m) => m.business_id);
  if (!ids.length) return;
  const { error } = await supabase.from("businesses").update({ industry: industry as SignupBusinessType }).in("id", ids).is("industry", null);
  if (error) logServerError("auth.confirm.industry", error);
}

/**
 * A new account that hasn't set up its business yet (signed up with the
 * account-only form) goes to the one-screen setup, with the business type and
 * country it signed up with — whatever destination the email link names (the
 * hosted email template links to /dashboard). Null: go where the link says.
 */
async function setupDestination(supabase: Awaited<ReturnType<typeof createClient>>, next: string, locale: Locale): Promise<string | null> {
  if (splitLocale(new URL(next, "http://x").pathname).path !== "/dashboard") return null;
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata;
  if (!data.user || meta?.setup !== "later") return null;
  const { count } = await supabase.from("business_members").select("business_id", { count: "exact", head: true }).eq("user_id", data.user.id);
  if (count) return null;
  const country = typeof meta.country_code === "string" && isCountryCode(meta.country_code) ? meta.country_code : undefined;
  return localizePath(locale, workspaceSetupPath({ vertical: businessTypeFromVertical(meta.vertical), country }));
}

/**
 * Landing point for links in auth emails (confirm sign-up, reset password).
 * Supports both the token-hash links used by WazaBolt's email templates and
 * PKCE `?code=` links (Supabase's default templates, and the return leg of any
 * OAuth sign-in), so `next` — e.g. /en/dashboard/setup?vertical=school — is
 * honoured whichever way the person authenticated.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // Email links carry a locale-prefixed `next` (/fr/dashboard); older links may not.
  const rawNext = safeRedirectPath(searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : "/dashboard"));
  const locale = splitLocale(rawNext).locale ?? (await getRequestLocale());
  const next = localizePath(locale, rawNext);

  const fail = (reason: string) => {
    const url = request.nextUrl.clone();
    url.pathname = localizePath(locale, "/login");
    url.search = `?error=${reason}`;
    return NextResponse.redirect(url);
  };

  if (!isSupabaseConfigured()) return fail("not_configured");

  const supabase = await createClient();
  let error: unknown = null;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    return fail("link_invalid");
  }

  if (error) {
    logServerError("auth.confirm", error);
    return fail("link_invalid");
  }
  if (type !== "recovery") await applySignupBusinessType(supabase);

  // The destination keeps its own query (the setup screen's ?vertical= and ?country=); nothing else is carried over.
  const target = new URL(type === "recovery" ? next : ((await setupDestination(supabase, next, locale)) ?? next), request.nextUrl.origin);
  const url = request.nextUrl.clone();
  url.pathname = target.pathname;
  url.search = target.search;
  if (splitLocale(target.pathname).path === "/dashboard" && type !== "recovery") url.searchParams.set("welcome", "1");
  return NextResponse.redirect(url);
}
