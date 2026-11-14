"use client";

import { createContext, useContext } from "react";

import { permissionsFor, roleAllowed, type AppRole, type Permissions } from "@/lib/auth/permissions";
import type { BusinessRole } from "@/types/database";

/*
 * The signed-in member's permissions for browser components (the dashboard
 * layout provides the role). For display only: the server decides what is
 * loaded and allowed.
 */

const PermissionsContext = createContext<{ role: BusinessRole | null; permissions: Permissions }>({ role: null, permissions: permissionsFor(null) });

export function PermissionsProvider({ role, children }: { role: BusinessRole | null; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={{ role, permissions: permissionsFor(role) }}>{children}</PermissionsContext.Provider>;
}

/** { role, canViewRevenue, canEditCatalog, canToggleStockOnly, canManageTeam, canConfigureAI } for the signed-in member. */
export function usePermissions(): Permissions {
  return useContext(PermissionsContext).permissions;
}

/** The browser-side RoleGuard, for client components (the server one, components/auth/role-guard, is preferred). */
export function ClientRoleGuard({ allowedRoles, fallback = null, children }: { allowedRoles: readonly AppRole[]; fallback?: React.ReactNode; children: React.ReactNode }) {
  const { role } = useContext(PermissionsContext);
  return <>{roleAllowed(role, allowedRoles) ? children : fallback}</>;
}
