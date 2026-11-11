import type { Metadata } from "next";
import Link from "next/link";

import { WazaBoltLogo } from "@/components/brand/logo";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { defaultModules, getBusinessModules } from "@/lib/modules";
import { UserCard, initials } from "@/components/dashboard/user-card";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Clock, Lock, PauseCircle, ShieldCheck, TriangleAlert } from "lucide-react";

import { BusinessSwitcher } from "@/components/dashboard/business-switcher";
import { BranchSwitcher } from "@/components/dashboard/branch-switcher";
import { getBranchContext } from "@/lib/branches";
import { currentUserIsPlatformAdmin, pendingRequestsForAdmin } from "@/lib/admin/access";
import { getCurrentBusiness, hasRole, listMyBusinesses, requireUser } from "@/lib/auth/dal";
import { formatDate } from "@/components/app/ui";
import { siteConfig } from "@/config/site";
import { aiPausedByWazaBolt } from "@/lib/billing/controls";
import { currentPlanId } from "@/lib/billing/entitlements";
import { planNameFor } from "@/lib/billing/plan-names";
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
  const [whatsapp, usage, businesses, platformAdmin, waitingPlanRequests, paused, modules, branchCtx] = await Promise.all([
    business ? getWhatsAppConnection(business.id) : null,
    // Owners and admins are warned before the monthly AI allowance runs out.
    business && hasRole(business.role, "admin") ? createClient().then((db) => getUsageStatus(db, business.id)) : null,
    listMyBusinesses(),
    currentUserIsPlatformAdmin(),
    pendingRequestsForAdmin(),
    business ? aiPausedByWazaBolt(business.id) : false,
    business ? getBusinessModules(business) : defaultModules(null),
    business ? getBranchContext(business) : null,
  ]);
  const billingHref = localizePath(locale, "/dashboard/billing");
  const bar = "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm sm:px-6 print:hidden";
  // A school sees its plan under the school name (School Standard…).
  const bannerPlan = usage ? planNameFor(currentPlanId(usage.planId), usage.planName, modules.includes("school"), locale) : "";
  const billingState = usage?.billing.state;
  const trialLeft = usage && usage.billing.state === "trial" ? usage.billing.daysLeft : null;
  const connected = whatsapp?.status === "connected";
  const d = t.dashboard;
  // Only the WazaBolt team (platform_admins) sees the way to the admin pages.
  const userCard = (
    <>
      {platformAdmin ? (
        <Link
          href={localizePath(locale, waitingPlanRequests ? "/admin/plan-requests" : "/admin/businesses")}
          className="mb-3 flex items-center gap-2 rounded-xl border border-gold/40 px-3 py-2 text-sm font-semibold text-gold hover:bg-cream/5"
        >
          <ShieldCheck className="size-4" aria-hidden /> {d.nav.platformAdmin}
          {waitingPlanRequests ? (
            <span className="ml-auto rounded-full bg-coral-500 px-2 py-0.5 text-xs font-bold text-white" title={format(d.nav.planRequestsWaiting, { count: waitingPlanRequests })}>
              {waitingPlanRequests}
            </span>
          ) : null}
        </Link>
      ) : null}
      <UserCard name={user.fullName} email={user.email} locale={locale} labels={d.userCard} />
    </>
  );

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-deep p-5 lg:flex print:hidden">
        <Link href={localizePath(locale, "/dashboard")} aria-label={d.title} className="rounded-lg">
          <WazaBoltLogo tone="dark" size="sm" />
        </Link>
        <div className="-mx-1 mt-6 flex-1 overflow-y-auto px-1">
          <SidebarNav labels={d.nav} role={business?.role ?? null} modules={modules} />
        </div>
        {userCard}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-cream/90 px-4 backdrop-blur-md sm:px-6 print:hidden">
          <MobileNav footer={userCard} labels={d.nav} role={business?.role ?? null} modules={modules} />
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
            {business ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-slate">
                <span>{d.header.roles[business.role]}</span>
                {/* Several branches: owners and admins switch; members tied to a branch see its name. */}
                {branchCtx?.multi ? (
                  branchCtx.locked ? (
                    <span className="font-semibold" data-testid="branch-name">
                      · {branchCtx.current.name}
                    </span>
                  ) : (
                    <BranchSwitcher current={branchCtx.current.id} branches={branchCtx.branches.map((b) => ({ id: b.id, name: b.name }))} locale={locale} label={d.branches.switch} />
                  )
                ) : null}
              </div>
            ) : null}
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
        {paused ? (
          <div role="status" className={`${bar} border-coral-200 bg-coral-50 text-coral-800`}>
            <PauseCircle className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">{format(d.billingBanner.paused, { email: siteConfig.contact.email })}</p>
          </div>
        ) : null}
        {usage && (billingState === "payment_due" || billingState === "renew_soon") ? (
          <div role="status" data-testid="billing-banner" className={`${bar} ${billingState === "payment_due" ? "border-coral-200 bg-coral-50 text-coral-800" : "border-gold-200 bg-gold-50 text-gold-800"}`}>
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              {format(billingState === "payment_due" ? d.billingBanner.paymentDue : d.billingBanner.renewSoon, {
                plan: bannerPlan,
                date: formatDate(usage.currentPeriodEnd, locale),
                grace: formatDate(usage.billing.graceUntil, locale),
              })}
            </p>
            <Link href={`${billingHref}#change-plan`} className="font-semibold underline underline-offset-2">
              {d.billingBanner.renew}
            </Link>
          </div>
        ) : null}
        {usage && usage.limit > 0 && usage.level !== "ok" ? (
          <div
            role="status"
            className={
              usage.level === "reached"
                ? "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-coral-200 bg-coral-50 px-4 py-2.5 text-sm text-coral-800 sm:px-6 print:hidden"
                : "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold-200 bg-gold-50 px-4 py-2.5 text-sm text-gold-800 sm:px-6 print:hidden"
            }
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              {format(usage.level === "reached" ? d.usageBanner.reached : d.usageBanner.warning, {
                used: formatNumber(usage.used, locale),
                limit: formatNumber(usage.limit, locale),
                plan: bannerPlan,
              })}
            </p>
            <Link href={`${billingHref}#change-plan`} className="font-semibold underline underline-offset-2">
              {usage.level === "reached" ? d.usageBanner.upgrade : d.usageBanner.cta}
            </Link>
          </div>
        ) : null}
        {business?.readOnly && hasRole(business.role, "admin") ? (
          <div role="status" data-testid="read-only-banner" className={`${bar} border-coral-200 bg-coral-50 text-coral-800`}>
            <Lock className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">{d.billingBanner.readOnly}</p>
            <Link href={`${billingHref}#change-plan`} className="font-semibold underline underline-offset-2">
              {d.billingBanner.choosePlan}
            </Link>
          </div>
        ) : business?.readOnly ? (
          <div role="status" data-testid="read-only-banner" className={`${bar} border-coral-200 bg-coral-50 text-coral-800`}>
            <Lock className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">{d.billingBanner.readOnlyMember}</p>
          </div>
        ) : null}
        {trialLeft !== null && usage ? (
          <div role="status" data-testid="trial-banner" className={`${bar} ${trialLeft <= 3 ? "border-gold-200 bg-gold-50 text-gold-800" : "border-waza-100 bg-mint/60 text-deep"}`}>
            <Clock className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              {format(trialLeft <= 1 ? d.billingBanner.trialLastDay : d.billingBanner.trial, { plan: bannerPlan, days: formatNumber(trialLeft, locale), date: formatDate(usage.currentPeriodEnd, locale) })}
            </p>
            <Link href={`${billingHref}#change-plan`} className="font-semibold underline underline-offset-2">
              {d.billingBanner.choosePlan}
            </Link>
          </div>
        ) : null}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
