import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/log";
import type { Database } from "@/types/database";

/** The service-role client, or a member's own session (billing_standing() checks membership). */
type Db = SupabaseClient<Database>;

/*
 * What an unpaid plan stops, checked on the server before the action runs.
 * The database refuses the same things (supabase/migrations/…_billing_standing.sql,
 * WB421), so a direct call can't get around it.
 *
 *   standing    trialing · active · past_due (the grace days after a paid
 *               period ended) · expired (no plan: read-only, as before)
 *   broadcast   no broadcast starts or goes on sending while past_due or expired
 *   invite      no new invitation while past_due or expired
 *
 * The plan's caps stay where they are enforced today: team seats by the
 * database when an invitation is created or accepted (WB413, counting the
 * pending invitations), and the AI assistant's monthly conversations by its
 * guard in the reply pipeline (lib/billing/guard.ts), which hands chats over
 * the cap to the team instead of dropping them.
 */

export type Standing = "trialing" | "active" | "past_due" | "expired";
export type GatedAction = "broadcast" | "invite";
export type Entitlement = { ok: true; standing: Standing } | { ok: false; standing: Standing; reason: "payment_due" | "plan_required" };

const STANDINGS: readonly Standing[] = ["trialing", "active", "past_due", "expired"];

/** The standings each action is refused in. */
const BLOCKED_WHILE: Record<GatedAction, readonly Standing[]> = {
  broadcast: ["past_due", "expired"],
  invite: ["past_due", "expired"],
};

/** Pure: may a business in this standing do this? */
export function decideEntitlement(standing: Standing, action: GatedAction): Entitlement {
  if (!BLOCKED_WHILE[action].includes(standing)) return { ok: true, standing };
  return { ok: false, standing, reason: standing === "past_due" ? "payment_due" : "plan_required" };
}

/** The plan's standing (billing_standing() in the database). Unknown or unreadable: expired, so nothing is sent on a guess. */
export async function getStanding(db: Db, businessId: string): Promise<Standing> {
  const { data, error } = await db.rpc("billing_standing", { p_business_id: businessId });
  if (error) logServerError("billing.standing", error);
  return STANDINGS.includes(data as Standing) ? (data as Standing) : "expired";
}

export async function checkEntitlements(db: Db, businessId: string, action: GatedAction): Promise<Entitlement> {
  return decideEntitlement(await getStanding(db, businessId), action);
}
