import { Workflow } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/app/ui";
import { requireBusiness } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.automations.title);

/** Placeholder: automations (follow-ups, reminders, broadcasts) are out of scope for this stage. */
export default async function AutomationsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  await requireBusiness(localizePath(locale, "/dashboard/automations"));
  const a = t.dashboard.automations;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={a.title} />
      <EmptyState icon={Workflow} title={t.dashboard.common.comingSoon} text={a.text} />
    </div>
  );
}
