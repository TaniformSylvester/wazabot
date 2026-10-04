import "server-only";

/*
 * How businesses pay WazaBolt (prepaid, monthly or yearly).
 *
 * Today ("manual"): the team takes Mobile Money, cash or a bank transfer
 * outside WazaBolt and records it when approving the plan request
 * (approve_plan_change → subscription_payments).
 *
 * A Mobile Money provider (Campay or Notch Pay, to be chosen) implements
 * PaymentProvider: startPayment asks the customer to pay for a plan request
 * (a push to their phone), confirmPayment reads the provider's webhook; a
 * confirmed payment is recorded exactly like a manual one.
 */

export const PAYMENT_METHODS = ["mobile_money", "cash", "bank", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A payment for a plan request, ready to approve it with. */
export type PaymentRecord = { amount: number; method: PaymentMethod; reference: string | null; actorUserId: string | null };

export interface PaymentProvider {
  id: string;
  /** Starts a collection for a plan request; absent when payments are taken outside WazaBolt. */
  startPayment?(input: { requestId: string; amount: number; currency: "XAF"; phone: string }): Promise<{ reference: string }>;
  /** A provider notification → the confirmed payment and its request (null if it isn't one). */
  confirmPayment?(request: Request): Promise<(PaymentRecord & { requestId: string }) | null>;
}

export const manualProvider: PaymentProvider = { id: "manual" };

/** The provider in use. */
export const paymentProvider: PaymentProvider = manualProvider;
