import { localizePath } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/i18n/config";
import { SIGNUP_VERTICALS, businessTypeFromVertical, verticalOfType, type SignupVertical } from "@/lib/validation/auth-rules";

/*
 * Beta waitlist mode: while NEXT_PUBLIC_WAITLIST_MODE is "true", sign-up is
 * closed and every "Start free trial" button becomes "Join the early-access
 * beta", leading to /waitlist (the vertical the visitor picked comes along).
 * Set it to "false" (or remove it) and redeploy: sign-up and the 14-day trial
 * are back, no code change. NEXT_PUBLIC_ values are fixed when the site is
 * built, so a change takes effect with the next deployment.
 *
 * Existing accounts still log in, and invitation links still work.
 */
export const WAITLIST_MODE = process.env.NEXT_PUBLIC_WAITLIST_MODE === "true";

/** "shop" · "restaurant" · "school" from a ?vertical= (or ?type=) value; undefined when unknown or "other". */
export function waitlistVertical(value: unknown): SignupVertical | undefined {
  if (typeof value === "string" && (SIGNUP_VERTICALS as readonly string[]).includes(value)) return value as SignupVertical;
  return verticalOfType(businessTypeFromVertical(value));
}

/** The waitlist form, with the vertical pre-selected. */
export function waitlistHref(locale: Locale, vertical?: unknown): string {
  const v = waitlistVertical(vertical);
  return localizePath(locale, v ? `/waitlist?vertical=${v}` : "/waitlist");
}

/**
 * Where a "start" button leads: the sign-up page as given (path with its
 * query), or the waitlist while it's on — keeping the vertical.
 */
export function startHref(locale: Locale, registerPathWithQuery = "/register"): string {
  if (!WAITLIST_MODE) return localizePath(locale, registerPathWithQuery);
  const q = new URLSearchParams(registerPathWithQuery.split("?")[1] ?? "");
  return waitlistHref(locale, q.get("vertical") ?? q.get("type") ?? undefined);
}
