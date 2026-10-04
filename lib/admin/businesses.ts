import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * Every business on WazaBolt, newest sign-up first, for the WazaBolt team.
 * Account-level facts only (who signed up, plan, setup progress) — never a
 * business's customers or conversations.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type BusinessRow = {
  id: string;
  name: string;
  city: string | null;
  industry: string | null;
  createdAt: string;
  setupDone: boolean;
  owner: { name: string; email: string | null } | null;
  members: number;
  planId: string | null;
  planStatus: string | null;
  interval: "month" | "year";
  periodEnd: string | null;
  /** The WazaBolt kill switch. */
  aiPaused: boolean;
  whatsapp: { status: string; number: string | null } | null;
};

export async function listAllBusinesses(admin: Admin, limit = 500): Promise<BusinessRow[]> {
  const { data: businesses, error } = await admin
    .from("businesses")
    .select("id, name, city, industry, created_at, onboarding_completed_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const ids = (businesses ?? []).map((b) => b.id);
  if (!ids.length) return [];

  const [members, subs, wa, controls] = await Promise.all([
    admin.from("business_members").select("business_id, user_id, role").in("business_id", ids),
    admin.from("subscriptions").select("business_id, plan_id, status, billing_interval, current_period_end").in("business_id", ids),
    admin.from("whatsapp_connections").select("business_id, status, display_phone_number").in("business_id", ids),
    admin.from("platform_business_controls").select("business_id, ai_paused").eq("ai_paused", true),
  ]);
  const paused = new Set((controls.data ?? []).map((c) => c.business_id));
  const ownerIds = [...new Set((members.data ?? []).filter((m) => m.role === "owner").map((m) => m.user_id))];
  const { data: users } = ownerIds.length ? await admin.from("users").select("id, full_name, email").in("id", ownerIds) : { data: [] };
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  return (businesses ?? []).map((b) => {
    const team = (members.data ?? []).filter((m) => m.business_id === b.id);
    const ownerId = team.find((m) => m.role === "owner")?.user_id;
    const owner = ownerId ? userById.get(ownerId) : undefined;
    const sub = (subs.data ?? []).find((s) => s.business_id === b.id);
    const conn = (wa.data ?? []).find((w) => w.business_id === b.id);
    return {
      id: b.id,
      name: b.name,
      city: b.city,
      industry: b.industry,
      createdAt: b.created_at,
      setupDone: Boolean(b.onboarding_completed_at),
      owner: owner ? { name: owner.full_name, email: owner.email } : null,
      members: team.length,
      planId: sub?.plan_id ?? null,
      planStatus: sub?.status ?? null,
      interval: sub?.billing_interval === "year" ? "year" : "month",
      periodEnd: sub?.current_period_end ?? null,
      aiPaused: paused.has(b.id),
      whatsapp: conn ? { status: conn.status, number: conn.display_phone_number } : null,
    };
  });
}

/** Sign-ups in the last 7 and 30 days, counted from the list. */
export function signupCounts(rows: BusinessRow[], now: Date) {
  const since = (days: number) => rows.filter((r) => new Date(r.createdAt).getTime() >= now.getTime() - days * 86_400_000).length;
  return { total: rows.length, last7: since(7), last30: since(30), whatsappConnected: rows.filter((r) => r.whatsapp?.status === "connected").length };
}
