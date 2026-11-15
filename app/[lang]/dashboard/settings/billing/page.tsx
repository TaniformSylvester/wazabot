import { redirect } from "next/navigation";

import { requireBusiness } from "@/lib/auth/dal";
import { permissionsFor } from "@/lib/auth/permissions";
import { getLocale } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

/** /dashboard/settings/billing → the Billing page for the owner; anyone else goes back to the dashboard. */
export default async function SettingsBillingPage() {
  const locale = await getLocale();
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/billing"));
  redirect(localizePath(locale, permissionsFor(business.role).canManageBilling || business.awaitingPaidPlan ? "/dashboard/billing" : "/dashboard"));
}
