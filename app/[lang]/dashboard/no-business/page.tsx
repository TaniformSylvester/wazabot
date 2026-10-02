import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.noBusiness.title);

/** Signed in, but no longer a member of any business. */
export default async function NoBusinessPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  await requireUser(localizePath(locale, "/dashboard"));
  if (await getCurrentBusiness()) redirect(localizePath(locale, "/dashboard"));
  const nb = t.dashboard.noBusiness;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-surface text-deep">
        <Building2 className="size-7" aria-hidden />
      </span>
      <h1 className="type-h2 mt-5">{nb.title}</h1>
      <p className="type-body mt-2 text-slate">{nb.text}</p>
    </div>
  );
}
