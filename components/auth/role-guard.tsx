import "server-only";

import { getCurrentBusiness } from "@/lib/auth/dal";
import { roleAllowed, type AppRole } from "@/lib/auth/permissions";

/**
 * Renders its children only for the given roles (owner, manager, staff),
 * otherwise the fallback. A server component: what it hides is never sent
 * to the browser. It hides UI only — pages must not load what a role may
 * not see, and every server action checks the role again (authorize()).
 *
 *   <RoleGuard allowedRoles={["owner", "manager"]} fallback={null}>…</RoleGuard>
 */
export async function RoleGuard({ allowedRoles, fallback = null, children }: { allowedRoles: readonly AppRole[]; fallback?: React.ReactNode; children: React.ReactNode }) {
  const business = await getCurrentBusiness();
  return <>{roleAllowed(business?.role, allowedRoles) ? children : fallback}</>;
}
