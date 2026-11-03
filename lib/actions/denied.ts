import "server-only";

import { getCurrentBusiness } from "@/lib/auth/dal";

import { fail, type FormState } from "./form";

/**
 * After authorize() refused: "plan_required" when the business has no plan
 * (its trial or paid period ended — the app shows a "See plans" prompt, not
 * an error), otherwise "forbidden".
 */
export async function denied(): Promise<FormState> {
  const business = await getCurrentBusiness();
  return fail(business?.readOnly || business?.awaitingPaidPlan ? "plan_required" : "forbidden");
}
