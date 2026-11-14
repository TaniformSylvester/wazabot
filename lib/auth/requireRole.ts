import "server-only";

import { getCurrentBusiness, getCurrentUser, type BusinessContext, type CurrentBusiness } from "@/lib/auth/dal";
import { appRoleOf, permissionsFor, type AppRole, type Permissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { BusinessRole } from "@/types/database";

/*
 * Server-side authorization for every Server Action and route handler.
 *
 *   1. The session is verified (Supabase Auth, from the request cookies).
 *   2. The member record is read fresh from the database for the target
 *      business — never trusted from the browser: a business id sent by the
 *      client is only used if this user is a member of it.
 *   3. The member's role is checked against the allowed roles (owner,
 *      manager, staff). "staff" covers agents and viewers; mutations need a
 *      member who can act (`access: "write"`, the default), so viewers —
 *      read-only staff — are refused.
 *
 * Row Level Security enforces the same rules in the database; this gives
 * every endpoint a clear 401 / 403 before any query runs, and the verified
 * business id every query must be scoped to.
 */

export type RoleCheckOptions = {
  /** "write" (default): viewers are read-only staff and are refused. "read": any member with an allowed role. */
  access?: "read" | "write";
  /** A business id sent by the client: honoured only if it is the user's current business. */
  businessId?: string | null;
  /** A business waiting for its paid plan only allows Billing. */
  whileAwaitingPlan?: boolean;
  /** A read-only business (no plan) still allows reads and exports. */
  readOnlyOk?: boolean;
};

export type RoleContext = BusinessContext & {
  /** The verified member record. */
  member: { role: BusinessRole; appRole: AppRole };
  permissions: Permissions;
};

export type RoleCheck = { ok: true; ctx: RoleContext } | { ok: false; status: 401 | 403; error: "unauthenticated" | "forbidden" | "plan_required" };

/** Owners and managers. */
export const MANAGERS = ["owner", "manager"] as const satisfies readonly AppRole[];
/** Owners, managers and staff. */
export const EVERYONE = ["owner", "manager", "staff"] as const satisfies readonly AppRole[];
/** Owner only. */
export const OWNER = ["owner"] as const satisfies readonly AppRole[];

/** Stored roles that can act as staff (viewers only read; teachers and kitchen staff have their own screens and checks). */
const ACTING_STAFF: readonly BusinessRole[] = ["agent"];

export async function requireRole(allowed: readonly AppRole[], opts: RoleCheckOptions = {}): Promise<RoleCheck> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const business: CurrentBusiness | null = await getCurrentBusiness();
  if (!business) return { ok: false, status: 403, error: "forbidden" };
  // A business id from the client must be the verified current business.
  if (opts.businessId && opts.businessId !== business.id) return { ok: false, status: 403, error: "forbidden" };

  // The member record, read again for this user and this business (the current business is cached per request).
  const db = await createClient();
  const { data: member } = await db.from("business_members").select("role").eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
  if (!member) return { ok: false, status: 403, error: "forbidden" };
  const role = member.role as BusinessRole;
  const appRole = appRoleOf(role);
  if (!allowed.includes(appRole)) return { ok: false, status: 403, error: "forbidden" };
  if (appRole === "staff" && (opts.access ?? "write") === "write" && !ACTING_STAFF.includes(role)) return { ok: false, status: 403, error: "forbidden" };

  if (business.awaitingPaidPlan && !opts.whileAwaitingPlan) return { ok: false, status: 403, error: "plan_required" };
  if (business.readOnly && (opts.access ?? "write") === "write" && !opts.whileAwaitingPlan && !opts.readOnlyOk) return { ok: false, status: 403, error: "plan_required" };

  return { ok: true, ctx: { user, business: { ...business, role }, member: { role, appRole }, permissions: permissionsFor(role) } };
}

/** For Server Actions: the verified context, or null (the action returns denied()). */
export async function requireRoleForAction(allowed: readonly AppRole[], opts: RoleCheckOptions = {}): Promise<RoleContext | null> {
  const r = await requireRole(allowed, opts);
  return r.ok ? r.ctx : null;
}

/** For route handlers: the JSON error response (401 / 403) for a failed check. */
export function roleErrorResponse(r: Extract<RoleCheck, { ok: false }>): Response {
  return Response.json({ ok: false, error: r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
}
