import Link from "next/link";
import { Check } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { siteConfig } from "@/config/site";

const points = [
  "Automated replies from your own catalogue and FAQs",
  "Orders captured inside the conversation",
  "Your team can take over any chat, any time",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col">
        <header className="container-page flex h-20 items-center lg:px-12">
          <Link href="/" aria-label="WazaBolt home" className="rounded-lg">
            <Logo />
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:px-6 sm:pt-12 lg:items-center lg:pt-0">
          {children}
        </main>
      </div>

      <aside className="bg-geo-light relative hidden overflow-hidden bg-ink p-12 text-sand lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-32 -top-32 size-96 rounded-full bg-bolt-500/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 size-96 rounded-full bg-ember-500/20 blur-3xl" />
        <p className="type-label relative text-bolt-400">{siteConfig.positioning}</p>
        <div className="relative">
          <p className="type-h1 max-w-md text-sand">{siteConfig.tagline}</p>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sand/80">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-bolt-500 text-ink">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sand/50">{siteConfig.trademarkNotice}</p>
      </aside>
    </div>
  );
}
