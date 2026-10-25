import { format, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { Entitlements, PlanLimits } from "@/lib/data/queries";
import type { Messages } from "@/messages/en";

/** The Free-plan grace notice (dashboard banner and Billing): every Free limit that will start, school limits for schools. */
export function graceText(
  t: Messages["dashboard"]["plan"],
  { date, limits, ent, school, price, locale }: { date: string; limits: PlanLimits; ent: Entitlements | null; school: boolean; price: string; locale: Locale },
): string {
  const n = (v: number | null | undefined) => formatNumber(v ?? 0, locale);
  return format(t.grace, {
    date,
    products: n(limits.maxProducts),
    sales: n(limits.maxMonthlySales),
    documents: n(ent?.maxDocuments),
    price,
    school: school && ent ? format(t.graceSchool, { students: n(ent.maxStudents), reportCards: n(ent.maxReportCardStudents) }) : "",
  });
}
