"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu } from "lucide-react";

import { WazaBoltLogo } from "@/components/brand/logo";
import { useI18n } from "@/components/i18n/i18n-provider";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { mainNav } from "@/config/site";
import { splitLocale } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { t, href } = useI18n();
  const pathname = splitLocale(usePathname()).path;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));

  // WazaBolt Schools (/schools): a school-only menu, so a school never lands on the shop pages.
  const school = pathname === "/schools";
  const sn = t.common.schoolNav;
  const nav: { href: string; label: string; home?: boolean }[] = school
    ? [
        { href: "#how", label: sn.how },
        { href: "#features", label: sn.features },
        { href: "#plans", label: sn.plans },
        { href: "#faq", label: sn.faq },
      ]
    : mainNav.map((item) => ({ href: href(item.href), label: t.common.nav[item.key], home: item.href === "/" }));
  const active = (h: string) => !school && isActive(splitLocale(h).path);
  const homeHref = school ? href("/schools") : href("/");
  const registerHref = school ? `${href("/register")}?type=schools` : href("/register");
  const badge = school ? (
    <span className="rounded-full bg-mint px-2.5 py-0.5 font-display text-sm font-bold text-waza-700" data-testid="school-badge">
      {sn.badge}
    </span>
  ) : null;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-[background-color,box-shadow,border-color] duration-300",
        scrolled
          ? "border-b border-line bg-cream/90 shadow-[0_4px_24px_-12px_rgb(16_42_42/0.18)] backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-6 lg:h-20">
        <Link href={homeHref} aria-label={school ? sn.home : t.common.brand.home} className="flex shrink-0 items-center gap-2 rounded-lg">
          {school ? (
            <WazaBoltLogo size="md" />
          ) : (
            <>
              <WazaBoltLogo size="md" className="min-[1680px]:hidden" />
              <WazaBoltLogo size="md" withTagline tagline={t.common.brand.tagline} className="hidden min-[1680px]:inline-flex" />
            </>
          )}
          {badge}
        </Link>

        <nav aria-label={t.common.nav.main} className="hidden xl:block" data-testid={school ? "school-nav" : undefined}>
          <ul className="flex items-center xl:gap-1">
            {nav.map((item) => (
              // The logo links home, so "Home" only appears once there is room for it.
              <li key={item.href} className={item.home ? "hidden 2xl:block" : undefined}>
                <Link
                  href={item.href}
                  aria-current={active(item.href) ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap rounded-full px-2.5 py-2 text-[0.9375rem] font-medium text-deep/80 transition-colors hover:text-waza-700 2xl:px-3.5",
                    "after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-[3px] after:origin-left after:scale-x-0 after:rounded-full after:bg-waza-500 after:transition-transform after:duration-300 hover:after:scale-x-100 2xl:after:inset-x-3.5",
                    active(item.href) && "text-waza-700 after:scale-x-100",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher compact className="hidden md:inline-flex" />
          <Button asChild variant="ghost" className="hidden xl:inline-flex">
            <Link href={href("/login")}>{t.common.nav.login}</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex sm:px-6">
            <Link href={registerHref}>
              <span className="xl:hidden">{school ? sn.startShort : t.common.nav.startFreeShort}</span>
              <span className="hidden xl:inline">{school ? sn.start : t.common.nav.startFree}</span>
            </Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="xl:hidden" aria-label={t.common.nav.openMenu}>
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-6">
              <SheetTitle className="sr-only">{t.common.nav.menu}</SheetTitle>
              <SheetDescription className="sr-only">{t.common.nav.siteNavigation}</SheetDescription>
              <span className="flex items-center gap-2">
                <WazaBoltLogo size="sm" />
                {badge}
              </span>
              <nav aria-label={t.common.nav.mobile} className="mt-6">
                <ul className="flex flex-col gap-1">
                  {nav.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          aria-current={active(item.href) ? "page" : undefined}
                          className={cn(
                            "flex items-center justify-between rounded-xl px-4 py-3.5 font-display text-lg font-semibold text-deep transition-colors hover:bg-mint",
                            active(item.href) && "bg-mint text-waza-700",
                          )}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="mt-auto flex flex-col gap-3">
                <LanguageSwitcher className="self-center" />
                <SheetClose asChild>
                  <Button asChild variant="outline" size="lg">
                    <Link href={href("/login")}>{t.common.nav.login}</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild size="lg">
                    <Link href={registerHref}>
                      {school ? sn.start : t.common.nav.startFree} <ArrowRight />
                    </Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
