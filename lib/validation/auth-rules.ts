import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";

/**
 * The sign-in and sign-up rules for the browser, without Zod (Zod adds about
 * 90 KB to the login and sign-up pages, a lot on a weak connection). The same
 * rules as lib/validation/auth.ts, which the Server Actions apply with Zod and
 * which stays authoritative; tests/unit/auth-rules.test.ts keeps them in step.
 * Messages are keys into the `auth.validation` dictionary.
 */

/** The kind of business chosen at sign-up; it decides the modules and the setup steps (businesses.industry). */
export const SIGNUP_BUSINESS_TYPES = ["retail", "school", "restaurant", "other"] as const;
export type SignupBusinessType = (typeof SIGNUP_BUSINESS_TYPES)[number];
/** The countries a business can sign up in (lib/i18n/country-packs.ts ACTIVE_COUNTRIES). */
export const SIGNUP_COUNTRIES = ["CM", "ZW"] as const;
export type SignupCountry = (typeof SIGNUP_COUNTRIES)[number];

export type RegisterInput = { fullName: string; businessName: string; businessType: SignupBusinessType; country: SignupCountry; email: string; password: string };
export type InviteSignUpInput = Pick<RegisterInput, "fullName" | "password">;
export type LoginInput = { email: string; password: string };
export type ForgotPasswordInput = { email: string };
export type ResetPasswordInput = { password: string; confirmPassword: string };

type Check = (value: unknown, values: Record<string, unknown>) => string | null;
const text = (v: unknown) => (typeof v === "string" ? v : "");

// The usual shape of an address (the server checks it strictly).
const email: Check = (v) => (/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(text(v).trim()) ? null : "email_invalid");
const newPassword: Check = (v) => {
  const p = text(v);
  if (p.length < 8) return "password_min";
  if (p.length > 72) return "password_max";
  if (!/[A-Za-z]/.test(p)) return "password_letter";
  if (!/[0-9]/.test(p)) return "password_number";
  return null;
};
const between = (min: string, value: unknown) => {
  const s = text(value).trim();
  return s.length < 2 ? min : s.length > 120 ? "too_long" : null;
};

export const authRules = {
  register: {
    fullName: (v) => between("name_required", v),
    businessName: (v) => between("business_required", v),
    businessType: (v) => ((SIGNUP_BUSINESS_TYPES as readonly unknown[]).includes(v) ? null : "business_type_required"),
    country: (v) => (v === undefined || (SIGNUP_COUNTRIES as readonly unknown[]).includes(v) ? null : "invalid"),
    email,
    password: newPassword,
  },
  inviteSignUp: { fullName: (v) => between("name_required", v), password: newPassword },
  login: { email, password: (v) => (text(v).length >= 1 ? null : "password_required") },
  forgotPassword: { email },
  resetPassword: {
    password: newPassword,
    confirmPassword: (v, all) => (v !== all.password ? "password_mismatch" : null),
  },
} satisfies Record<string, Record<string, Check>>;

/** A React Hook Form resolver from these rules: the first broken rule per field. */
export function rulesResolver<T extends FieldValues>(rules: Record<string, Check>): Resolver<T> {
  return async (values) => {
    const errors: Record<string, { type: string; message: string }> = {};
    for (const [name, check] of Object.entries(rules)) {
      const message = check(values[name], values);
      if (message) errors[name] = { type: "validate", message };
    }
    return Object.keys(errors).length ? { values: {}, errors: errors as FieldErrors<T> } : { values, errors: {} };
  };
}
