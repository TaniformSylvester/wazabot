import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, type Locale } from "@/lib/i18n/config";
import { matchLocale } from "@/lib/i18n/negotiate";
import { localizePath, splitLocale } from "@/lib/i18n/paths";
import { updateSession } from "@/lib/supabase/proxy";

const PROTECTED_PREFIXES = ["/dashboard"];
/** Pages a signed-in user shouldn't see again. (/reset-password is allowed: recovery sessions land there.) */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];
/** Routes that are not localized (email-link handler, generated images). */
const UNLOCALIZED_PREFIXES = ["/auth/", "/brand-assets/"];

/**
 * 1. Locale routing: every page lives under /en or /fr. Unprefixed URLs are
 *    redirected using the visitor's saved choice (cookie), then their
 *    browser's Accept-Language, then English.
 * 2. Optimistic auth routing. Real authorization happens again on the server
 *    (lib/auth/dal.ts) and in the database (Row Level Security).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (UNLOCALIZED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return (await updateSession(request)).response;
  }

  const { locale, path } = splitLocale(pathname);
  if (!locale) {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    const preferred: Locale = isLocale(saved) ? saved : matchLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = localizePath(preferred, pathname);
    return NextResponse.redirect(url);
  }

  const { response, userId, configured } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (isProtected && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = localizePath(locale, "/login");
    url.search = "";
    url.searchParams.set("next", safeRedirectPath(pathname + search, localizePath(locale, "/dashboard")));
    if (!configured) url.searchParams.set("error", "not_configured");
    return rememberLocale(NextResponse.redirect(url), locale, request);
  }

  if (userId && GUEST_ONLY.includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = safeRedirectPath(request.nextUrl.searchParams.get("next"), localizePath(locale, "/dashboard"));
    url.search = "";
    return rememberLocale(NextResponse.redirect(url), locale, request);
  }

  return rememberLocale(response, locale, request);
}

/**
 * Remember the locale of pages the visitor actually opens. Client-side (RSC)
 * requests are skipped: background prefetches of links in the other language
 * would otherwise overwrite the choice. The language switcher sets the cookie
 * itself before navigating.
 */
function rememberLocale(response: NextResponse, locale: Locale, request: NextRequest) {
  // Browsers mark page loads with Sec-Fetch-Dest: document (router fetches send "empty").
  const dest = request.headers.get("sec-fetch-dest");
  const isDocument = dest ? dest === "document" : !request.headers.has("rsc");
  if (isDocument && request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
  }
  return response;
}

export const config = {
  // Skip static assets and metadata files.
  matcher: [
    "/((?!api/|_next/static|_next/image|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|images/|logo/|.*/opengraph-image|.*/twitter-image).*)",
  ],
};
