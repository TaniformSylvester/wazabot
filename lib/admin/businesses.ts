import "server-only";

import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * Every business on WazaBolt, newest sign-up first, for the WazaBolt team.
 * Account-level facts only (who signed up, plan, setup progress) — never a
 * business's customers or conversations.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Ids per request: each id goes in the URL (?business_id=in.(…)), so hundreds at once make it too long. */
const IDS_PER_REQUEST = 100;

/** Runs one lookup per batch of ids, in parallel, and joins the rows. A failed batch is logged, not hidden. */
async function inBatches<T>(scope: string, ids: string[], fetch: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) batches.push(ids.slice(i, i + IDS_PER_REQUEST));
  const results = await Promise.all(batches.map((b) => fetch(b)));
  return results.flatMap((r) => {
    if (r.error) logServerError(`admin.businesses.${scope}`, r.error);
    return r.data ?? [];
  });
}

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
    inBatches("members", ids, (b) => admin.from("business_members").select("business_id, user_id, role").in("business_id", b)),
    inBatches("subscriptions", ids, (b) => admin.from("subscriptions").select("business_id, plan_id, status, billing_interval, current_period_end").in("business_id", b)),
    inBatches("whatsapp", ids, (b) => admin.from("whatsapp_connections").select("business_id, status, display_phone_number").in("business_id", b)),
    admin.from("platform_business_controls").select("business_id, ai_paused").eq("ai_paused", true),
  ]);
  if (controls.error) logServerError("admin.businesses.controls", controls.error);
  const paused = new Set((controls.data ?? []).map((c) => c.business_id));
  const ownerIds = [...new Set(members.filter((m) => m.role === "owner").map((m) => m.user_id))];
  const users = await inBatches("owners", ownerIds, (b) => admin.from("users").select("id, full_name, email").in("id", b));
  const userById = new Map(users.map((u) => [u.id, u]));
  const teamByBusiness = new Map<string, typeof members>();
  for (const m of members) teamByBusiness.set(m.business_id, [...(teamByBusiness.get(m.business_id) ?? []), m]);
  const subByBusiness = new Map(subs.map((x) => [x.business_id, x]));
  const waByBusiness = new Map(wa.map((x) => [x.business_id, x]));

  return (businesses ?? []).map((b) => {
    const team = teamByBusiness.get(b.id) ?? [];
    const ownerId = team.find((m) => m.role === "owner")?.user_id;
    const owner = ownerId ? userById.get(ownerId) : undefined;
    const sub = subByBusiness.get(b.id);
    const conn = waByBusiness.get(b.id);
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
