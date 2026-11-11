import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Where businesses outside Cameroon send their plan payments in US dollars
 * (a bank transfer, usually international via SWIFT). Entered by the WazaBolt
 * team in admin (platform_settings.usd_bank_details), never in the code; shown
 * on Billing only to the owners and admins of businesses paying in dollars.
 */

export const USD_BANK_KEY = "usd_bank_details";

export type UsdBankDetails = {
  beneficiary: string;
  bank: string;
  bankAddress: string;
  swift: string;
  accountNumber: string;
  accountType: string;
  /** For payers inside the US (ACH / Fedwire); optional. */
  routing: string | null;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The stored details, or null when none are set (or they're incomplete). */
export function parseUsdBankDetails(value: unknown): UsdBankDetails | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const d: UsdBankDetails = {
    beneficiary: text(v.beneficiary, 120),
    bank: text(v.bank, 120),
    bankAddress: text(v.bankAddress, 200),
    swift: text(v.swift, 11).toUpperCase(),
    accountNumber: text(v.accountNumber, 40),
    accountType: text(v.accountType, 40),
    routing: text(v.routing, 20) || null,
  };
  return d.beneficiary && d.bank && d.swift && d.accountNumber ? d : null;
}

/** Validates what the team typed; null with the first problem otherwise. */
export function validateUsdBankDetails(input: Record<string, string>): { details: UsdBankDetails } | { error: string } {
  const d = parseUsdBankDetails(input);
  if (!d) return { error: "Fill in at least the beneficiary name, bank, SWIFT code and account number." };
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(d.swift)) return { error: "The SWIFT code has 8 or 11 letters and digits (e.g. CITIUS33)." };
  if (!/^[0-9A-Za-z -]{4,40}$/.test(d.accountNumber)) return { error: "The account number has letters, digits, spaces or dashes only." };
  if (d.routing && !/^[0-9]{9}$/.test(d.routing)) return { error: "The routing (ABA) number has 9 digits." };
  return { details: d };
}

/** Read with the service role (the table is closed to businesses). */
export async function getUsdBankDetails(): Promise<UsdBankDetails | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("platform_settings").select("value").eq("key", USD_BANK_KEY).maybeSingle();
  return parseUsdBankDetails(data?.value);
}
