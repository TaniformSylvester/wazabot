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
export const SIGNUP_COUNTRIES = ["CM", "ZW", "NG", "ZA", "GH", "KE"] as const;
export type SignupCountry = (typeof SIGNUP_COUNTRIES)[number];

/**
 * ?vertical= from the home page's tabs (and the older ?type= from other
 * pages): the business type to pre-select on the workspace setup screen.
 */
export const SIGNUP_VERTICALS = ["shop", "restaurant", "school"] as const;
export type SignupVertical = (typeof SIGNUP_VERTICALS)[number];
const VERTICAL_ALIASES: Record<string, SignupBusinessType> = {
  shop: "retail",
  shops: "retail",
  retail: "retail",
  restaurant: "restaurant",
  restaurants: "restaurant",
  school: "school",
  schools: "school",
  other: "other",
};
/** The business type for a ?vertical= (or ?type=) value; undefined when unknown. */
export function businessTypeFromVertical(value: unknown): SignupBusinessType | undefined {
  return typeof value === "string" ? VERTICAL_ALIASES[value.trim().toLowerCase()] : undefined;
}
/** The ?vertical= value for a business type (other → none). */
export function verticalOfType(type: SignupBusinessType | undefined): SignupVertical | undefined {
  return type === "retail" ? "shop" : type === "restaurant" || type === "school" ? type : undefined;
}

/** Sign-up creates the account only; the business is named and typed on the setup screen after the email is confirmed. */
export type RegisterInput = { fullName: string; email: string; password: string };
export type InviteSignUpInput = Pick<RegisterInput, "fullName" | "password">;
export type WorkspaceSetupInput = { name: string; currency: SignupCountry; type: SignupBusinessType };
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
