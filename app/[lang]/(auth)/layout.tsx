import Link from "next/link";
import { Check } from "lucide-react";

import { WazaBoltLogo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col">
        <header className="container-page flex h-20 items-center justify-between gap-4 lg:px-12">
          <Link href={localizePath(locale, "/")} aria-label={t.common.brand.home} className="rounded-lg">
            <WazaBoltLogo />
          </Link>
          <LanguageSwitcher />
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:px-6 sm:pt-12 lg:items-center lg:pt-0">
          {children}
        </main>
      </div>

      <aside className="bg-geo-light relative hidden overflow-hidden bg-deep p-12 text-cream lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-32 -top-32 size-96 rounded-full bg-waza-500/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 size-96 rounded-full bg-coral-500/20 blur-3xl" />
        <p className="type-label relative text-waza-400">{t.common.brand.positioning}</p>
        <div className="relative">
          <p className="type-h1 max-w-md text-cream">{t.common.brand.tagline}</p>
          <ul className="mt-8 space-y-3">
            {t.auth.points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-cream/80">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-waza-500 text-deep">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-cream/50">{t.common.brand.trademarkNotice}</p>
      </aside>
    </div>
  );
}
