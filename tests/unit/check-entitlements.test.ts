import { describe, expect, it } from "vitest";

import { permissionsFor } from "@/lib/auth/permissions";
import { decideEntitlement, type GatedAction, type Standing } from "@/lib/billing/checkEntitlements";

describe("decideEntitlement", () => {
  const actions: GatedAction[] = ["broadcast", "invite"];

  it("allows broadcasts and invitations on a trial or a paid period", () => {
    for (const action of actions) {
      for (const standing of ["trialing", "active"] as Standing[]) {
        expect(decideEntitlement(standing, action)).toEqual({ ok: true, standing });
      }
    }
  });

  it("pauses them during the grace days (payment due)", () => {
    for (const action of actions) expect(decideEntitlement("past_due", action)).toEqual({ ok: false, standing: "past_due", reason: "payment_due" });
  });

  it("refuses them with no plan", () => {
    for (const action of actions) expect(decideEntitlement("expired", action)).toEqual({ ok: false, standing: "expired", reason: "plan_required" });
  });
});

describe("billing is the owner's", () => {
  it("only the owner manages billing", () => {
    expect(permissionsFor("owner").canManageBilling).toBe(true);
    for (const r of ["admin", "agent", "viewer", "teacher", "kitchen", null] as const) expect(permissionsFor(r).canManageBilling).toBe(false);
  });
});
