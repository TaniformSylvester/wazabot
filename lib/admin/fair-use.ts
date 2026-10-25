import "server-only";

import { logServerError } from "@/lib/log";
import { resolveModules } from "@/lib/modules";
import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * Fair use on plans without a student limit (Pro): every school on such a
 * plan, with how much it uses, for the WazaBolt team to review by hand.
 * Counts only — never a school's students, marks or documents.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type FairUseRow = {
  id: string;
  name: string;
  planId: string;
  activeStudents: number;
  classes: number;
  teachers: number;
  documents: number;
  /** Above the highest student limit of a limited plan. */
  aboveReference: boolean;
};

export type FairUseReport = {
  /** The highest student limit on a limited plan (Business: 500), the yardstick for "large". */
  reference: { planId: string; maxStudents: number } | null;
  unlimitedPlans: string[];
  schools: FairUseRow[];
};

const count = async (scope: string, q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: n, error } = await q;
  if (error) logServerError(`admin.fairUse.${scope}`, error);
  return n ?? 0;
};

export async function getFairUseReport(admin: Admin): Promise<FairUseReport> {
  const { data: plans, error } = await admin.from("plans").select("id, max_students");
  if (error) throw error;
  const unlimitedPlans = (plans ?? []).filter((p) => p.max_students === null).map((p) => p.id);
  const limited = (plans ?? []).filter((p) => p.max_students !== null).sort((a, b) => b.max_students! - a.max_students!)[0];
  const reference = limited ? { planId: limited.id, maxStudents: limited.max_students! } : null;
  if (!unlimitedPlans.length) return { reference, unlimitedPlans, schools: [] };

  const { data: subs, error: subsError } = await admin.from("subscriptions").select("business_id, plan_id").in("plan_id", unlimitedPlans).limit(1000);
  if (subsError) throw subsError;
  const ids = (subs ?? []).map((s) => s.business_id);
  if (!ids.length) return { reference, unlimitedPlans, schools: [] };

  const [{ data: businesses, error: bError }, { data: moduleRows, error: mError }] = await Promise.all([
    admin.from("businesses").select("id, name, industry").in("id", ids),
    admin.from("business_modules").select("business_id, module, enabled").in("business_id", ids),
  ]);
  if (bError) throw bError;
  if (mError) logServerError("admin.fairUse.modules", mError);
  const planBy = new Map((subs ?? []).map((s) => [s.business_id, s.plan_id]));
  const schools = (businesses ?? []).filter((b) =>
    resolveModules(
      b.industry,
      (moduleRows ?? []).filter((m) => m.business_id === b.id),
    ).includes("school"),
  );

  const rows = await Promise.all(
    schools.map(async (b): Promise<FairUseRow> => {
      const head = { count: "exact", head: true } as const;
      const [activeStudents, classes, teachers, documents] = await Promise.all([
        count("students", admin.from("school_students").select("id", head).eq("business_id", b.id).eq("status", "active")),
        count("classes", admin.from("school_classes").select("id", head).eq("business_id", b.id)),
        count("teachers", admin.from("business_members").select("user_id", head).eq("business_id", b.id).eq("role", "teacher")),
        count("documents", admin.from("documents").select("id", head).eq("business_id", b.id)),
      ]);
      return { id: b.id, name: b.name, planId: planBy.get(b.id) ?? "", activeStudents, classes, teachers, documents, aboveReference: !!reference && activeStudents > reference.maxStudents };
    }),
  );
  return { reference, unlimitedPlans, schools: rows.sort((a, b) => b.activeStudents - a.activeStudents) };
}
