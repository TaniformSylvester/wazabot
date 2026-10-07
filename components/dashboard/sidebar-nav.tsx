"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { dashboardNav } from "@/config/dashboard-nav";
import { splitLocale } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { ROLE_RANK, type BusinessRole } from "@/types/database";
import type { Messages } from "@/messages/en";

export function SidebarNav({ labels, role, onNavigate }: { labels: Messages["dashboard"]["nav"]; role: BusinessRole | null; onNavigate?: () => void }) {
  const allowed = (min?: BusinessRole) => !min || (role !== null && ROLE_RANK[role] >= ROLE_RANK[min]);
  const { t, href } = useI18n();
  const pathname = splitLocale(usePathname()).path;
  // The most specific matching item is active (so /settings/languages doesn't also light up /settings).
  const activeHref = dashboardNav
    .flatMap((g) => g.items)
    .filter((i) => !i.soon && (pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label={labels.label} className="flex flex-col gap-5">
      {dashboardNav.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-white/45">{labels.groups[group.key]}</p>
          <ul className="space-y-0.5">
            {group.items.filter((i) => allowed(i.minRole)).map(({ key, href: path, icon: Icon, soon }) => {
              const label = labels.items[key];
              if (soon) {
                return (
                  <li key={path}>
                    <span
                      aria-disabled="true"
                      className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/45"
                    >
                      <Icon className="size-4.5" aria-hidden />
                      {label}
                      <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wider text-white/55">
                        {t.common.badges.soon}
                      </span>
                    </span>
                  </li>
                );
              }
              const active = path === activeHref;
              return (
                <li key={path}>
                  <Link
                    href={href(path)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waza-400",
                      active ? "bg-waza-500 font-semibold text-deep" : "text-white/85 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon className="size-4.5" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
