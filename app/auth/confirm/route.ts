import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { localizePath, splitLocale } from "@/lib/i18n/paths";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { logServerError } from "@/lib/log";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

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

  const url = request.nextUrl.clone();
  url.pathname = next;
  url.search = "";
  if (splitLocale(next).path === "/dashboard" && type !== "recovery") url.searchParams.set("welcome", "1");
  return NextResponse.redirect(url);
}
