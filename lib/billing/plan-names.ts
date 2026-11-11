/*
 * What a plan is called. Shops and restaurants see Boutique / Business /
 * Multi-shop; a school sees the same three plans under school names
 * ("WazaBolt Schools"). Same plans, same prices, same limits: only the name.
 */

export const SCHOOL_PLAN_NAMES = {
  en: { boutique: "School Starter", business: "School Standard", multishop: "School Plus" },
  fr: { boutique: "École Starter", business: "École Standard", multishop: "École Plus" },
} as const;

type Lang = keyof typeof SCHOOL_PLAN_NAMES;
type SchoolPlanId = keyof (typeof SCHOOL_PLAN_NAMES)["en"];

/** A school's name for a plan on sale; null for other plans (no plan, old plans). */
export function schoolPlanName(planId: string, lang: string): string | null {
  const names = SCHOOL_PLAN_NAMES[lang === "fr" ? "fr" : ("en" as Lang)];
  return planId in names ? names[planId as SchoolPlanId] : null;
}

/** The plan's name for this business: the school name for a school, else the usual one. */
export function planNameFor(planId: string, usual: string, school: boolean, lang: string): string {
  return (school ? schoolPlanName(planId, lang) : null) ?? usual;
}
