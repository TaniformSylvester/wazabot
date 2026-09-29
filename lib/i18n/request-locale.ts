import "server-only";

import { cookies } from "next/headers";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

/**
 * Locale for Server Actions and Route Handlers, where the /[lang] segment
 * isn't available: the explicit value when valid, else the locale cookie
 * (set by proxy.ts on every localized page view), else the default.
 */
export async function getRequestLocale(explicit?: unknown): Promise<Locale> {
  if (isLocale(explicit)) return explicit;
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
}
