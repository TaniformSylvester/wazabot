import Link from "next/link";
import { SearchX } from "lucide-react";

import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

/** Missing — or another business's — record. Nothing about it is revealed. */
export default async function DashboardNotFound() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <SearchX className="size-10 text-line-strong" aria-hidden />
      <p className="type-label mt-4 text-waza-700">{t.pages.notFound.label}</p>
      <h1 className="type-h2 mt-2">{t.dashboard.errors.not_found}</h1>
      <Link href={localizePath(locale, "/dashboard")} className="mt-6 text-sm font-semibold text-waza-700 hover:underline">
        {t.dashboard.nav.items.dashboard}
      </Link>
    </div>
  );
}
