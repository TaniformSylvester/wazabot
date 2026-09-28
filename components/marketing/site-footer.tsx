import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { footerNav, siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_2fr]">
        <div>
          <Link href="/" aria-label={`${siteConfig.name} home`} className="inline-block rounded-lg">
            <Logo />
          </Link>
          <p className="mt-4 max-w-xs text-sm text-slate-waza">{siteConfig.tagline}</p>
          <p className="mt-1 text-sm font-semibold text-waza-700">{siteConfig.supporting}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="text-sm font-semibold text-deep">{group.title}</p>
              <ul className="mt-3 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-waza transition-colors hover:text-waza-800">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <p className="container-page py-6 text-sm text-slate-waza">© 2026 {siteConfig.name}</p>
      </div>
    </footer>
  );
}
