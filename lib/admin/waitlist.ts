import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { SIGNUP_VERTICALS, type SignupVertical } from "@/lib/validation/auth-rules";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type WaitlistLead = { id: string; business_name: string; whatsapp_number: string; email: string; vertical: string; country_code: string | null; locale: string; created_at: string };

/** ?vertical= on the admin page and the export: one vertical, or all. */
export function adminVertical(value: unknown): SignupVertical | null {
  return typeof value === "string" && (SIGNUP_VERTICALS as readonly string[]).includes(value) ? (value as SignupVertical) : null;
}

/** Beta waitlist leads, newest first (WazaBolt team only: the caller checked platform_admins). */
export async function listWaitlistLeads(admin: Admin, vertical: SignupVertical | null, limit = 5000): Promise<WaitlistLead[]> {
  let q = admin.from("waitlist_leads").select("id, business_name, whatsapp_number, email, vertical, country_code, locale, created_at").order("created_at", { ascending: false }).limit(limit);
  if (vertical) q = q.eq("vertical", vertical);
  const { data } = await q;
  return data ?? [];
}

/** How many leads per vertical. */
export async function waitlistCounts(admin: Admin): Promise<Record<SignupVertical, number>> {
  const counts = await Promise.all(
    SIGNUP_VERTICALS.map(async (v) => [v, (await admin.from("waitlist_leads").select("id", { count: "exact", head: true }).eq("vertical", v)).count ?? 0] as const),
  );
  return Object.fromEntries(counts) as Record<SignupVertical, number>;
}
