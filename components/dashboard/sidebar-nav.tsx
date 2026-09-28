"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { dashboardNav } from "@/config/dashboard-nav";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-6">
      {dashboardNav.map((group, gi) => (
        <div key={gi}>
          {group.title ? <p className="type-label mb-2 px-3 text-sand/40">{group.title}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map(({ label, href, icon: Icon, soon }) => {
              const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
              if (soon) {
                return (
                  <li key={href}>
                    <span
                      aria-disabled="true"
                      className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sand/40"
                    >
                      <Icon className="size-4.5" aria-hidden />
                      {label}
                      <span className="ml-auto rounded-full bg-sand/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-sand/50">
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
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-bolt-500 text-ink" : "text-sand/80 hover:bg-sand/10 hover:text-sand",
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
