import { z } from "zod";

/**
 * Shared by the browser (instant feedback) and Server Actions (authoritative).
 * Messages are keys into the `auth.validation` dictionary, so the same schema
 * serves every UI language; forms translate them with useValidationMessage().
 */

const email = z.string().trim().toLowerCase().pipe(z.email("email_invalid"));

const newPassword = z
  .string()
  .min(8, "password_min")
  .max(72, "password_max")
  .regex(/[A-Za-z]/, "password_letter")
  .regex(/[0-9]/, "password_number");

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "name_required").max(120, "too_long"),
  businessName: z.string().trim().min(2, "business_required").max(120, "too_long"),
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "password_required"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Keys of `auth.errors` in the dictionaries. */
export type AuthErrorKey =
  | "not_configured"
  | "invalid_form"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "same_password"
  | "rate_limited"
  | "signup_disabled"
  | "signup_failed"
  | "reset_expired"
  | "unknown";

/** Result returned by every auth Server Action. Errors are dictionary keys, translated by the form. */
export type ActionResult =
  | { ok: true; email?: string }
  | { ok: false; error: AuthErrorKey; fieldErrors?: Record<string, string[] | undefined> };
