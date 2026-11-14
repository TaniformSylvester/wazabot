import { describe, expect, it } from "vitest";

import { appRoleOf, canToggleAvailability, permissionsFor, roleAllowed } from "@/lib/auth/permissions";

describe("roles and permissions", () => {
  it("maps the stored roles to owner, manager and staff", () => {
    expect(appRoleOf("owner")).toBe("owner");
    expect(appRoleOf("admin")).toBe("manager");
    for (const r of ["agent", "viewer", "teacher", "kitchen"] as const) expect(appRoleOf(r)).toBe("staff");
    expect(appRoleOf(null)).toBe("staff");
  });

  it("owners and managers: revenue, catalogue, team and AI settings", () => {
    for (const r of ["owner", "admin"] as const) {
      expect(permissionsFor(r)).toMatchObject({ canViewRevenue: true, canEditCatalog: true, canToggleStockOnly: false, canManageTeam: true, canConfigureAI: true });
    }
  });

  it("staff: no revenue, catalogue, team or AI settings; agents may toggle availability only", () => {
    expect(permissionsFor("agent")).toMatchObject({ role: "staff", canViewRevenue: false, canEditCatalog: false, canToggleStockOnly: true, canManageTeam: false, canConfigureAI: false });
    expect(permissionsFor("viewer").canToggleStockOnly).toBe(false);
    expect(permissionsFor("kitchen").canToggleStockOnly).toBe(false);
    expect(canToggleAvailability("agent")).toBe(true);
    expect(canToggleAvailability("admin")).toBe(true);
    expect(canToggleAvailability("viewer")).toBe(false);
  });

  it("RoleGuard's rule: allowed app roles", () => {
    expect(roleAllowed("admin", ["owner", "manager"])).toBe(true);
    expect(roleAllowed("agent", ["owner", "manager"])).toBe(false);
    expect(roleAllowed("agent", ["staff"])).toBe(true);
    expect(roleAllowed(null, ["owner"])).toBe(false);
  });
});
