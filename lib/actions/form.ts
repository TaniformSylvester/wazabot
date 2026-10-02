import { z } from "zod";

/**
 * Shared shape for dashboard Server Actions used with React's useActionState.
 * Errors are dictionary keys (dashboard.errors.* / auth.validation.*), so the
 * same action serves both UI languages.
 */
export type ActionErrorKey =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "duplicate"
  | "storage_unavailable"
  | "image_invalid"
  | "unknown"
  // WhatsApp (Stage 2)
  | "whatsapp_not_configured"
  | "whatsapp_number_in_use"
  | "whatsapp_not_in_account"
  | "whatsapp_token_invalid"
  | "whatsapp_verify_failed"
  | "whatsapp_not_connected"
  | "whatsapp_window_closed"
  | "whatsapp_send_failed"
  // Stage 4
  | "out_of_stock"
  | "already_member"
  | "invite_invalid"
  | "invite_wrong_email"
  | "already_on_plan"
  // Stage 6
  | "slot_unavailable"
  // Stage 7
  | "templates_failed"
  | "template_not_approved"
  | "follow_up_already_sent";

export type FormState = {
  status: "idle" | "success" | "error";
  error?: ActionErrorKey;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Id of the row created/updated. */
  id?: string;
  /** Extra detail for the error message, e.g. the item that is out of stock ({item} in the text). */
  detail?: string;
  /** A value the form shows after success, e.g. an invitation link. */
  value?: string;
  /** Bumped on each success so forms can reset or show a toast. */
  at?: number;
};

export const initialFormState: FormState = { status: "idle" };

export const ok = (id?: string): FormState => ({ status: "success", id, at: Date.now() });
export const fail = (error: ActionErrorKey, fieldErrors?: FormState["fieldErrors"], detail?: string): FormState => ({ status: "error", error, fieldErrors, detail });
export const invalid = (error: z.ZodError): FormState => fail("invalid", z.flattenError(error).fieldErrors as FormState["fieldErrors"]);

/** Maps a PostgREST/Postgres error to an action error key. */
export function dbError(error: { code?: string } | null | undefined): ActionErrorKey {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "WB409":
      return "out_of_stock";
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

/** Like dbError, keeping the item name of an out-of-stock error ("insufficient stock: Robe Ankara"). */
export function dbFail(error: { code?: string; message?: string } | null | undefined): FormState {
  const key = dbError(error);
  return fail(key, undefined, key === "out_of_stock" ? error?.message?.replace(/^insufficient stock:\s*/, "").slice(0, 200) : undefined);
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
