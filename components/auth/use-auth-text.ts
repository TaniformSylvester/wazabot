"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { AuthErrorKey } from "@/lib/validation/auth";

/** Auth-form text helpers: translate validation keys and action error keys. */
export function useAuthText() {
  const i18n = useI18n();
  const { validation, errors } = i18n.t.auth;
  return {
    ...i18n,
    a: i18n.t.auth,
    /** Validation message key (from the Zod schemas) → text in the current language. */
    fieldError: (key?: string) => (key ? (validation[key as keyof typeof validation] ?? key) : undefined),
    errorText: (key: AuthErrorKey) => errors[key] ?? errors.unknown,
  };
}
