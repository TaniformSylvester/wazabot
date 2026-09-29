"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { dashboardNav } from "@/config/dashboard-nav";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-5">
      {dashboardNav.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-white/45">{group.title}</p>
          <ul className="space-y-0.5">
            {group.items.map(({ label, href, icon: Icon, soon }) => {
              const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
              if (soon) {
                return (
                  <li key={href}>
                    <span
                      aria-disabled="true"
                      className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/45"
                    >
                      <Icon className="size-4.5" aria-hidden />
                      {label}
                      <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wider text-white/55">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={href}>
                  <Link
                    href={href}
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
