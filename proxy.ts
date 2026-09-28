import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { updateSession } from "@/lib/supabase/proxy";

const PROTECTED_PREFIXES = ["/dashboard"];
/** Pages a signed-in user shouldn't see again. (/reset-password is allowed: recovery sessions land there.) */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];

/**
 * Optimistic auth routing only. Real authorization happens again on the
 * server (lib/auth/dal.ts) and in the database (Row Level Security).
 */
export async function proxy(request: NextRequest) {
  const { response, userId, configured } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", safeRedirectPath(pathname + search));
    if (!configured) url.searchParams.set("error", "not_configured");
    return NextResponse.redirect(url);
  }

  if (userId && GUEST_ONLY.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = safeRedirectPath(request.nextUrl.searchParams.get("next"));
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip static assets and metadata files.
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|apple-icon.png|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sitemap.xml|images/|logo/).*)",
  ],
};
