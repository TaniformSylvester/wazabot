import type { BusinessRole } from "@/types/database";

/*
 * Who can do what, in three simple roles. The stored roles stay as they are
 * (business_members.role, enforced by Row Level Security and authorize() in
 * every server action); this maps them to the roles people talk about:
 *
 *   owner    the owner
 *   manager  admins
 *   staff    agents and viewers (and, for their own screens, teachers and kitchen staff)
 *
 * Pure and dependency-free: used by the server (RoleGuard, pages, actions)
 * and the browser (usePermissions) alike.
 */

export const APP_ROLES = ["owner", "manager", "staff"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function appRoleOf(role: BusinessRole | null | undefined): AppRole {
  if (role === "owner") return "owner";
  if (role === "admin") return "manager";
  return "staff";
}

export type Permissions = {
  role: AppRole;
  /** Money: sales, revenue, credit owed, profit, expenses, payments by method, fees collected, billing. */
  canViewRevenue: boolean;
  /** Create, edit and delete products and dishes, prices and stock counts. */
  canEditCatalog: boolean;
  /** Mark a product or dish available / unavailable — and nothing else in the catalogue (staff who take orders). */
  canToggleStockOnly: boolean;
  /** Invite and remove people, change roles. */
  canManageTeam: boolean;
  /** The AI assistant's settings, knowledge and automations. */
  canConfigureAI: boolean;
};

export function permissionsFor(role: BusinessRole | null | undefined): Permissions {
  const app = appRoleOf(role);
  const manager = app === "owner" || app === "manager";
  return {
    role: app,
    canViewRevenue: manager,
    canEditCatalog: manager,
    // Agents take orders and sell: they may switch availability. Viewers only look; teachers and kitchen staff have their own screens.
    canToggleStockOnly: !manager && role === "agent",
    canManageTeam: manager,
    canConfigureAI: manager,
  };
}

/** Can this role toggle a product's availability (managers through full catalogue editing, agents through the toggle)? */
export function canToggleAvailability(role: BusinessRole | null | undefined): boolean {
  const p = permissionsFor(role);
  return p.canEditCatalog || p.canToggleStockOnly;
}

export function roleAllowed(role: BusinessRole | null | undefined, allowed: readonly AppRole[]): boolean {
  return allowed.includes(appRoleOf(role));
}
