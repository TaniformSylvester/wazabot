import { z } from "zod";

/**
 * Shared shape for dashboard Server Actions used with React's useActionState.
 * Errors are dictionary keys (dashboard.errors.* / auth.validation.*), so the
 * same action serves both UI languages.
 */
export type ActionErrorKey = "forbidden" | "invalid" | "not_found" | "duplicate" | "storage_unavailable" | "image_invalid" | "unknown";

export type FormState = {
  status: "idle" | "success" | "error";
  error?: ActionErrorKey;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Id of the row created/updated. */
  id?: string;
  /** Bumped on each success so forms can reset or show a toast. */
  at?: number;
};

export const initialFormState: FormState = { status: "idle" };

export const ok = (id?: string): FormState => ({ status: "success", id, at: Date.now() });
export const fail = (error: ActionErrorKey, fieldErrors?: FormState["fieldErrors"]): FormState => ({ status: "error", error, fieldErrors });
export const invalid = (error: z.ZodError): FormState => fail("invalid", z.flattenError(error).fieldErrors as FormState["fieldErrors"]);

/** Maps a PostgREST/Postgres error to an action error key. */
export function dbError(error: { code?: string } | null | undefined): ActionErrorKey {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "23505":
      return "duplicate";
    case "22023":
    case "23514":
    case "23502":
      return "invalid";
    default:
      return "unknown";
  }
}

/** FormData → plain object; checkbox-style fields become booleans via the schema. */
export function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
