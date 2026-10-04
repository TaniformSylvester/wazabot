"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentUserIsPlatformAdmin } from "@/lib/admin/access";
import { decidePlanRequest } from "@/lib/admin/plan-requests";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { createAdminClient } from "@/lib/supabase/admin";

import { isUuid } from "./form";

/** WazaBolt team: approve or decline a business's plan request (the customer is emailed). */
async function decide(formData: FormData, decision: "approved" | "rejected") {
  const locale = String(formData.get("locale") ?? "en");
  const back = (q: string) => redirect(`${localizePath(isLocale(locale) ? locale : "en", "/admin/plan-requests")}?${q}`);
  const id = String(formData.get("request_id") ?? "");
  const admin = createAdminClient();
  // Server actions are reachable directly: check the caller again.
  if (!admin || !(await currentUserIsPlatformAdmin())) back("error=forbidden");
  if (!isUuid(id)) back("error=invalid");
  const result = await decidePlanRequest(admin!, id, decision);
  revalidatePath("/[lang]/admin/plan-requests", "page");
  revalidatePath("/[lang]/dashboard", "layout");
  back(result.ok ? `done=${decision}` : `error=${result.error}`);
}

export async function approvePlanRequest(formData: FormData) {
  await decide(formData, "approved");
}

export async function declinePlanRequest(formData: FormData) {
  await decide(formData, "rejected");
}
