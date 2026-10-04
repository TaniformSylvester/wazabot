import Link from "next/link";

import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** Tabs across the WazaBolt team's pages, plus the way back to the normal dashboard. Internal, English-only. */
export function AdminNav({ locale, active }: { locale: Locale; active: "businesses" | "margins" }) {
  const tabs = [
    { key: "businesses", label: "Businesses", href: "/admin/businesses" },
    { key: "margins", label: "Margins", href: "/admin/margins" },
  ] as const;
  return (
    <nav aria-label="WazaBolt admin" className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex items-center gap-1">
        <span className="mr-2 text-xs font-bold uppercase tracking-wider text-waza-700">WazaBolt admin</span>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={localizePath(locale, t.href)}
            aria-current={active === t.key ? "page" : undefined}
            className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", active === t.key ? "bg-deep text-cream" : "text-slate hover:bg-mint")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Link href={localizePath(locale, "/dashboard")} className="text-sm font-semibold text-waza-700 hover:underline">
        ← Back to my dashboard
      </Link>
    </nav>
  );
}
