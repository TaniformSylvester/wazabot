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
        <Link href={href("/")} aria-label={t.common.brand.home} className="shrink-0 rounded-lg">
          <WazaBoltLogo size="md" className="min-[1680px]:hidden" />
          <WazaBoltLogo size="md" withTagline tagline={t.common.brand.tagline} className="hidden min-[1680px]:inline-flex" />
        </Link>

        <nav aria-label={t.common.nav.main} className="hidden xl:block">
          <ul className="flex items-center xl:gap-1">
            {mainNav.map((item) => (
              // The logo links home, so "Home" only appears once there is room for it.
              <li key={item.href} className={item.href === "/" ? "hidden 2xl:block" : undefined}>
                <Link
                  href={href(item.href)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap rounded-full px-2.5 py-2 text-[0.9375rem] font-medium text-deep/80 transition-colors hover:text-waza-700 2xl:px-3.5",
                    "after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-[3px] after:origin-left after:scale-x-0 after:rounded-full after:bg-waza-500 after:transition-transform after:duration-300 hover:after:scale-x-100 2xl:after:inset-x-3.5",
                    isActive(item.href) && "text-waza-700 after:scale-x-100",
                  )}
                >
                  {t.common.nav[item.key]}
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
            <Link href={href("/register")}>
              <span className="xl:hidden">{t.common.nav.startFreeShort}</span>
              <span className="hidden xl:inline">{t.common.nav.startFree}</span>
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
              <WazaBoltLogo size="sm" />
              <nav aria-label={t.common.nav.mobile} className="mt-6">
                <ul className="flex flex-col gap-1">
                  {mainNav.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={href(item.href)}
                          aria-current={isActive(item.href) ? "page" : undefined}
                          className={cn(
                            "flex items-center justify-between rounded-xl px-4 py-3.5 font-display text-lg font-semibold text-deep transition-colors hover:bg-mint",
                            isActive(item.href) && "bg-mint text-waza-700",
                          )}
                        >
                          {t.common.nav[item.key]}
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
                    <Link href={href("/register")}>
                      {t.common.nav.startFree} <ArrowRight />
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
