import type { Metadata } from "next";
import Link from "next/link";

import { WazaBoltLogo } from "@/components/brand/logo";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserCard, initials } from "@/components/dashboard/user-card";
import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s | WazaBolt Dashboard" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const business = await getCurrentBusiness();
  const userCard = <UserCard name={user.fullName} email={user.email} />;

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-deep p-5 lg:flex">
        <Link href="/dashboard" aria-label="WazaBolt dashboard" className="rounded-lg">
          <WazaBoltLogo tone="dark" size="sm" />
        </Link>
        <div className="-mx-1 mt-6 flex-1 overflow-y-auto px-1">
          <SidebarNav />
        </div>
        {userCard}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-cream/90 px-4 backdrop-blur-md sm:px-6">
          <MobileNav footer={userCard} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold text-deep">{business?.name ?? "Your business"}</p>
            {business ? (
              <p className="text-xs capitalize text-slate">{business.role}</p>
            ) : null}
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-slate sm:inline-flex">
            <span className="size-2 rounded-full bg-line-strong" aria-hidden />
            WhatsApp not connected
          </span>
          <Link
            href="/dashboard/settings"
            aria-label="Account settings"
            className="grid size-9 place-items-center rounded-full bg-gold text-xs font-bold text-deep"
          >
            {initials(user.fullName, user.email)}
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
