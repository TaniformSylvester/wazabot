import "server-only";

import { cache } from "react";

import type { CurrentBusiness } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/*
 * Modules per business (business_modules): which parts of WazaBolt a business
 * uses. Only choices are stored; otherwise the defaults below apply. Modules
 * change what the dashboard shows; access to data is still decided by roles
 * and Row Level Security.
 */

export const MODULES = ["commerce", "ai", "docs", "school"] as const;
export type Module = (typeof MODULES)[number];

/** Schools: school + documents + WhatsApp AI. Everyone else: commerce + documents + WhatsApp AI. */
export function defaultModules(industry: string | null): Module[] {
  return industry === "school" ? ["school", "docs", "ai"] : ["commerce", "docs", "ai"];
}

export function resolveModules(industry: string | null, rows: { module: string; enabled: boolean }[]): Module[] {
  const on = new Set<Module>(defaultModules(industry));
  for (const r of rows) {
    if (!(MODULES as readonly string[]).includes(r.module)) continue;
    if (r.enabled) on.add(r.module as Module);
    else on.delete(r.module as Module);
  }
  return MODULES.filter((m) => on.has(m));
}

export const getBusinessModules = cache(async (business: Pick<CurrentBusiness, "id" | "industry">): Promise<Module[]> => {
  const db = await createClient();
  const { data } = await db.from("business_modules").select("module, enabled").eq("business_id", business.id);
  return resolveModules(business.industry, data ?? []);
});
