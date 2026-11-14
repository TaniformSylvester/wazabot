import { type SignupBusinessType, type SignupCountry, verticalOfType } from "@/lib/validation/auth-rules";

/** The workspace setup screen, keeping the business type (as ?vertical=) and country a visitor came with. */
export function workspaceSetupPath({ vertical, country }: { vertical?: SignupBusinessType; country?: SignupCountry }): string {
  const q = new URLSearchParams();
  const v = vertical === "other" ? "other" : verticalOfType(vertical);
  if (v) q.set("vertical", v);
  if (country) q.set("country", country);
  const s = q.toString();
  return `/dashboard/setup${s ? `?${s}` : ""}`;
}
