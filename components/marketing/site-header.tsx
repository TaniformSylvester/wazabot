"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu } from "lucide-react";

import { WazaBoltLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { mainNav, siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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
        <Link href="/" aria-label={`${siteConfig.name} home`} className="rounded-lg">
          <WazaBoltLogo size="md" className="xl:hidden" />
          <WazaBoltLogo size="md" withTagline className="hidden xl:inline-flex" />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center xl:gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3 py-2 text-[0.9375rem] font-medium text-deep/80 transition-colors hover:text-waza-700 xl:px-3.5",
                    "after:absolute after:inset-x-3 after:-bottom-0.5 after:h-[3px] after:origin-left after:scale-x-0 after:rounded-full after:bg-waza-500 after:transition-transform after:duration-300 hover:after:scale-x-100 xl:after:inset-x-3.5",
                    isActive(item.href) && "text-waza-700 after:scale-x-100",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden lg:inline-flex">
            <Link href="/login">Login</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex sm:px-6">
            <Link href="/register">Start Free</Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-6">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Site navigation</SheetDescription>
              <WazaBoltLogo size="sm" />
              <nav aria-label="Mobile" className="mt-6">
                <ul className="flex flex-col gap-1">
                  {mainNav.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          aria-current={isActive(item.href) ? "page" : undefined}
                          className={cn(
                            "flex items-center justify-between rounded-xl px-4 py-3.5 font-display text-lg font-semibold text-deep transition-colors hover:bg-mint",
                            isActive(item.href) && "bg-mint text-waza-700",
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
                <SheetClose asChild>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/login">Login</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild size="lg">
                    <Link href="/register">
                      Start Free <ArrowRight />
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
