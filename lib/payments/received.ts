import "server-only";

import { dbError, fail, type FormState } from "@/lib/actions/form";
import { localDayStart, localToday } from "@/lib/data/queries";

/*
 * Shared by the payment forms (orders, customers, invoices): the moment a
 * payment was received, and the database's refusals as form errors.
 */

/** The moment recorded for a payment: now for today, midday of an earlier day, refused for a later day. */
export function receivedAt(day: string | undefined, timezone: string): string | null | "future" {
  if (!day) return null;
  const today = localToday(timezone);
  if (day > today) return "future";
  if (day === today) return null;
  return new Date(new Date(localDayStart(day, timezone)).getTime() + 12 * 3600 * 1000).toISOString();
}

export function paymentError(error: { code?: string; message?: string } | null): FormState {
  const m = error?.message ?? "";
  if (m.includes("more than what is owed")) return fail("invalid", { amount: ["more_than_owed"] });
  if (m.includes("more than what was paid")) return fail("invalid", { amount: ["refund_more_than_paid"] });
  if (m.includes("in the future")) return fail("invalid", { received_on: ["payment_date_future"] });
  if (m.includes("cancelled or returned")) return fail("invalid", { amount: [m.startsWith("refunds") ? "refund_not_allowed" : "order_closed"] });
  if (m.includes("void the refund first")) return fail("invalid", { reason: ["void_refund_first"] });
  if (m.includes("void the receipt first")) return fail("receipt_exists", undefined, m.match(/receipt (\S+):/)?.[1] ?? "");
  if (m.includes("give a reason")) return fail("invalid", { reason: ["reason_required"] });
  return fail(dbError(error));
}

