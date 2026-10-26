import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { localizePath, splitLocale } from "@/lib/i18n/paths";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { logServerError } from "@/lib/log";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { SIGNUP_BUSINESS_TYPES, type SignupBusinessType } from "@/lib/validation/auth";

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
 * Landing point for links in auth emails (confirm sign-up, reset password).
 * Supports both the token-hash links used by WazaBolt's email templates and
 * PKCE `?code=` links from Supabase's default templates.
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

  const url = request.nextUrl.clone();
  url.pathname = next;
  url.search = "";
  if (splitLocale(next).path === "/dashboard" && type !== "recovery") url.searchParams.set("welcome", "1");
  return NextResponse.redirect(url);
}
