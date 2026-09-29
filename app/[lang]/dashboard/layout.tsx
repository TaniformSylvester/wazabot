import type { Metadata } from "next";
import Link from "next/link";

import { WazaBoltLogo } from "@/components/brand/logo";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserCard, initials } from "@/components/dashboard/user-card";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return {
    title: { default: t.dashboard.title, template: `%s | WazaBolt ${t.dashboard.title}` },
    robots: { index: false, follow: false },
  };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const user = await requireUser(localizePath(locale, "/dashboard"));
  const business = await getCurrentBusiness();
  const d = t.dashboard;
  const userCard = <UserCard name={user.fullName} email={user.email} locale={locale} labels={d.userCard} />;

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-deep p-5 lg:flex">
        <Link href={localizePath(locale, "/dashboard")} aria-label={d.title} className="rounded-lg">
          <WazaBoltLogo tone="dark" size="sm" />
        </Link>
        <div className="-mx-1 mt-6 flex-1 overflow-y-auto px-1">
          <SidebarNav labels={d.nav} />
        </div>
        {userCard}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-cream/90 px-4 backdrop-blur-md sm:px-6">
          <MobileNav footer={userCard} labels={d.nav} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold text-deep">{business?.name ?? d.header.yourBusiness}</p>
            {business ? <p className="text-xs text-slate">{d.header.roles[business.role]}</p> : null}
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-slate md:inline-flex">
            <span className="size-2 rounded-full bg-line-strong" aria-hidden />
            {d.header.whatsappNotConnected}
          </span>
          <LanguageSwitcher persist />
          <Link
            href={localizePath(locale, "/dashboard/settings")}
            aria-label={d.header.accountSettings}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-xs font-bold text-deep"
          >
            {initials(user.fullName, user.email)}
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
