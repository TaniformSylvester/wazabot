import Link from "next/link";

import { WazaBoltLogo } from "@/components/brand/logo";
import { footerNav, siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="bg-deep text-cream">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_2fr]">
        <div>
          <Link href="/" aria-label={`${siteConfig.name} home`} className="inline-block rounded-lg">
            <WazaBoltLogo tone="dark" />
          </Link>
          <p className="mt-4 max-w-xs font-display text-lg font-semibold text-cream">{siteConfig.tagline}</p>
          <p className="type-small mt-1 text-cream/60">{siteConfig.positioning}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="type-label text-waza-400">{group.title}</p>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-cream/70 transition-colors hover:text-waza-400">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-cream/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-cream/55 md:flex-row md:items-center md:justify-between md:gap-8">
          <p className="shrink-0">© 2026 {siteConfig.name}</p>
          <p className="md:text-right">{siteConfig.trademarkNotice}</p>
        </div>
      </div>
    </footer>
  );
}
