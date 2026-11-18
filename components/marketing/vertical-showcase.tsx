import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BellRing, FileText, GraduationCap, ListChecks, Receipt, Share2, Store, UtensilsCrossed, Wallet, ChefHat, ClipboardList } from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";
import { VerticalTabs } from "@/components/marketing/vertical-tabs";
import { plans } from "@/config/plans";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { startHref } from "@/lib/waitlist/mode";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

/*
 * The home page's business-type showcase: Shops, Restaurants, Schools. Each
 * tab: a one-line outcome, the workflows that work today, and a real
 * screenshot of WazaBolt on a phone (a demo workspace with example data,
 * in the visitor's language: public/images/showcase/<vertical>-<locale>.webp).
 * The coming-soon AI assistant is not shown here (see coming-next.tsx).
 */

const VERTICALS = [
  { key: "shops", icon: Store, href: "/solutions/retail", bullets: [Receipt, BellRing, FileText, Share2] },
  { key: "restaurants", icon: UtensilsCrossed, href: "/solutions/restaurants", bullets: [ClipboardList, ChefHat, Wallet] },
  { key: "schools", icon: GraduationCap, href: "/schools", bullets: [FileText, ListChecks, GraduationCap] },
] as const;

/** Each tab's "Start" button signs up with its business type (?vertical=), pre-selected on the workspace setup screen. */
const VERTICAL_PARAM = { shops: "shop", restaurants: "restaurant", schools: "school" } as const;

function ScreenPreview({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="mx-auto w-full max-w-[320px]" data-testid="showcase-screen">
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-deep bg-deep shadow-float">
        <Image src={src} alt={alt} width={640} height={918} sizes="(min-width: 400px) 308px, 80vw" className="h-auto w-full rounded-[1.5rem] bg-white" />
      </div>
      <figcaption className="mt-3 text-center text-xs text-slate" data-testid="showcase-caption">
        {caption}
      </figcaption>
    </figure>
  );
}

export async function VerticalShowcase() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const s = t.showcase;
  const vars = { kitchen: formatNumber(plans[0].maxKitchen, locale), teachers: formatNumber(plans[0].maxTeachers, locale) };
  const panels = VERTICALS.map(({ key, href, bullets }) => {
    const v = s.verticals[key];
    return (
      <div key={key} className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]" data-testid={`showcase-${key}`}>
        <div className="min-w-0">
          <h3 className="type-h2 text-2xl sm:text-3xl">{v.headline}</h3>
          <ul className="mt-6 flex flex-col gap-4">
            {v.bullets.map((b, i) => {
              const Icon = bullets[i] ?? FileText;
              return (
                <li key={b.title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-waza-700">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-deep">{b.title}</p>
                    <p className="mt-0.5 text-sm text-slate">{b.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-sm text-slate">{format(v.note, vars)}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={startHref(locale, `/register?vertical=${VERTICAL_PARAM[key]}`)} data-testid={`showcase-start-${key}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
              {t.common.nav.trialCta} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href={localizePath(locale, href)} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-5 text-sm font-semibold text-deep hover:bg-mint">
              {v.more}
            </Link>
          </div>
        </div>
        <ScreenPreview src={`/images/showcase/${key}-${locale}.webp`} alt={v.screenAlt} caption={s.screenCaption} />
      </div>
    );
  });
  return (
    <section id="showcase" aria-labelledby="showcase-title" className="bg-mint/50 py-16 sm:py-20">
      <div className="container-page">
        <SectionHeading id="showcase-title" eyebrow={s.eyebrow} title={s.title} description={s.description} />
        <div className="mt-10">
          <VerticalTabs
            label={s.tabsLabel}
            tabs={VERTICALS.map(({ key, icon: Icon }) => ({ key, label: s.verticals[key].tab, icon: <Icon className="size-4" aria-hidden /> }))}
            panels={panels}
          />
        </div>
      </div>
    </section>
  );
}
