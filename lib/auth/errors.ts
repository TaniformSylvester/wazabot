import type { AuthError } from "@supabase/supabase-js";

import type { AuthErrorKey } from "@/lib/validation/auth";

/**
 * Map Supabase Auth errors to dictionary keys (auth.errors.*) whose messages
 * are safe to show: helpful, but never revealing whether a particular email
 * has an account.
 */
export function authErrorKey(error: Pick<AuthError, "code" | "status" | "message">): AuthErrorKey {
  switch (error.code) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "weak_password":
      return "weak_password";
    case "same_password":
      return "same_password";
    case "signup_disabled":
      return "signup_disabled";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate_limited";
    case "user_already_exists":
    case "email_exists":
      return "signup_failed";
    default:
      return error.status === 429 ? "rate_limited" : "unknown";
  }
}
