import Link from "next/link";

import { WazaBoltLogo } from "@/components/brand/logo";
import { footerNav, siteConfig } from "@/config/site";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export async function SiteFooter() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <footer className="bg-deep text-cream">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_2fr]">
        <div>
          <Link href={localizePath(locale, "/")} aria-label={t.common.brand.home} className="inline-block rounded-lg">
            <WazaBoltLogo tone="dark" />
          </Link>
          <p className="mt-4 max-w-xs font-display text-lg font-semibold text-cream">{t.common.brand.tagline}</p>
          <p className="type-small mt-1 text-cream/60">{t.common.brand.positioning}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {footerNav.map((group) => (
            <nav key={group.key} aria-label={t.common.footer[group.key]}>
              <p className="type-label text-waza-400">{t.common.footer[group.key]}</p>
              <ul className="mt-3 space-y-0.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={localizePath(locale, link.href)} className="inline-block py-1.5 text-sm text-cream/70 transition-colors hover:text-waza-400">
                      {t.common.nav[link.key]}
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
          <p className="md:text-right">{t.common.brand.trademarkNotice}</p>
        </div>
      </div>
    </footer>
  );
}
