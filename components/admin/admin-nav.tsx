import Link from "next/link";

import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** Tabs across the WazaBolt team's pages, plus the way back to the normal dashboard. Internal, English-only. */
export function AdminNav({ locale, active, pendingPlanRequests = 0 }: { locale: Locale; active: "businesses" | "plan-requests" | "margins" | "pricing"; pendingPlanRequests?: number }) {
  const tabs = [
    { key: "businesses", label: "Businesses", href: "/admin/businesses", badge: 0 },
    { key: "plan-requests", label: "Plan requests", href: "/admin/plan-requests", badge: pendingPlanRequests },
    { key: "margins", label: "Margins", href: "/admin/margins", badge: 0 },
    { key: "pricing", label: "Pricing", href: "/admin/pricing", badge: 0 },
  ] as const;
  return (
    <nav aria-label="WazaBolt admin" className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-xs font-bold uppercase tracking-wider text-waza-700">WazaBolt admin</span>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={localizePath(locale, t.href)}
            aria-current={active === t.key ? "page" : undefined}
            className={cn("inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold", active === t.key ? "bg-deep text-cream" : "text-slate hover:bg-mint")}
          >
            {t.label}
            {t.badge ? <span className="ml-1.5 rounded-full bg-coral-500 px-1.5 py-0.5 text-[0.6875rem] font-bold text-white">{t.badge}</span> : null}
          </Link>
        ))}
      </div>
      <Link href={localizePath(locale, "/dashboard")} className="inline-flex min-h-8 items-center text-sm font-semibold text-waza-700 hover:underline">
        ← Back to my dashboard
      </Link>
    </nav>
  );
}
