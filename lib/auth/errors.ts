import type { AuthError } from "@supabase/supabase-js";

/**
 * Turn Supabase Auth errors into messages that are safe to show: helpful,
 * but never revealing whether a particular email has an account.
 */
export function authErrorMessage(error: Pick<AuthError, "code" | "status" | "message">): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match. Try again or reset your password.";
    case "email_not_confirmed":
      return "Please confirm your email first — check your inbox for the link we sent.";
    case "weak_password":
      return "That password is too weak. Use at least 8 characters with letters and numbers.";
    case "same_password":
      return "Your new password must be different from your current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "signup_disabled":
      return "New sign-ups are currently closed.";
    case "user_already_exists":
    case "email_exists":
      return "We couldn't create that account. If you already have one, log in or reset your password.";
    default:
      if (error.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
      return "Something went wrong. Please try again.";
  }
}
