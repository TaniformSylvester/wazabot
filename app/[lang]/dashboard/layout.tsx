import type { Metadata } from "next";
import Link from "next/link";

import { WazaBoltLogo } from "@/components/brand/logo";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserCard, initials } from "@/components/dashboard/user-card";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ShieldCheck, TriangleAlert } from "lucide-react";

import { BusinessSwitcher } from "@/components/dashboard/business-switcher";
import { currentUserIsPlatformAdmin } from "@/lib/admin/access";
import { getCurrentBusiness, hasRole, listMyBusinesses, requireUser } from "@/lib/auth/dal";
import { getUsageStatus } from "@/lib/billing/usage";
import { format, formatNumber } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppConnection } from "@/lib/data/queries";
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
  const [whatsapp, usage, businesses, platformAdmin] = await Promise.all([
    business ? getWhatsAppConnection(business.id) : null,
    // Owners and admins are warned before the monthly AI allowance runs out.
    business && hasRole(business.role, "admin") ? createClient().then((db) => getUsageStatus(db, business.id)) : null,
    listMyBusinesses(),
    currentUserIsPlatformAdmin(),
  ]);
  const connected = whatsapp?.status === "connected";
  const d = t.dashboard;
  // Only the WazaBolt team (platform_admins) sees the way to the admin pages.
  const userCard = (
    <>
      {platformAdmin ? (
        <Link
          href={localizePath(locale, "/admin/businesses")}
          className="mb-3 flex items-center gap-2 rounded-xl border border-gold/40 px-3 py-2 text-sm font-semibold text-gold hover:bg-cream/5"
        >
          <ShieldCheck className="size-4" aria-hidden /> {d.nav.platformAdmin}
        </Link>
      ) : null}
      <UserCard name={user.fullName} email={user.email} locale={locale} labels={d.userCard} />
    </>
  );

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
            {business && businesses.length > 1 ? (
              <BusinessSwitcher
                current={business.id}
                businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
                locale={locale}
                label={d.header.switchBusiness}
              />
            ) : (
              <p className="truncate font-display text-base font-bold text-deep">{business?.name ?? d.header.yourBusiness}</p>
            )}
            {business ? <p className="text-xs text-slate">{d.header.roles[business.role]}</p> : null}
          </div>
          <Link
            href={localizePath(locale, "/dashboard/whatsapp")}
            className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-slate hover:bg-mint md:inline-flex"
          >
            <span className={connected ? "size-2 rounded-full bg-waza-500" : "size-2 rounded-full bg-line-strong"} aria-hidden />
            {connected ? d.header.whatsappConnected : d.header.whatsappNotConnected}
          </Link>
          <LanguageSwitcher persist />
          <Link
            href={localizePath(locale, "/dashboard/settings")}
            aria-label={d.header.accountSettings}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-gold text-xs font-bold text-deep"
          >
            {initials(user.fullName, user.email)}
          </Link>
        </header>
        {usage && usage.level !== "ok" ? (
          <div
            role="status"
            className={
              usage.level === "reached"
                ? "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-coral-200 bg-coral-50 px-4 py-2.5 text-sm text-coral-800 sm:px-6"
                : "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold-200 bg-gold-50 px-4 py-2.5 text-sm text-gold-800 sm:px-6"
            }
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              {format(usage.level === "reached" ? d.usageBanner.reached : d.usageBanner.warning, {
                used: formatNumber(usage.used, locale),
                limit: formatNumber(usage.limit, locale),
                plan: usage.planName,
              })}
            </p>
            <Link href={localizePath(locale, "/dashboard/billing")} className="font-semibold underline underline-offset-2">
              {d.usageBanner.cta}
            </Link>
          </div>
        ) : null}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
