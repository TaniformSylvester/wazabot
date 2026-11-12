import Link from "next/link";
import { ArrowRight, GraduationCap, Store, UtensilsCrossed } from "lucide-react";

import { IndustryCard } from "@/components/marketing/industry-card";
import { landingKey, landingPath, solutions } from "@/config/solutions";
import { plans } from "@/config/plans";
import { iconTones } from "@/lib/brand/tones";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** The three core business types (shops, restaurants, schools) with their own pages, then every other business type. */
const core = [
  { key: "shops", href: "/solutions/retail", icon: Store, tone: "green" },
  { key: "restaurants", href: "/solutions/restaurants", icon: UtensilsCrossed, tone: "gold" },
  { key: "schools", href: "/schools", icon: GraduationCap, tone: "teal" },
] as const;

export async function SolutionsStrip() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const s = t.solutionsStrip;
  const vars = { kitchen: formatNumber(plans[0].maxKitchen, locale), teachers: formatNumber(plans[0].maxTeachers, locale) };
  return (
    <section aria-labelledby="solutions-strip-title" className="bg-mint/70">
      <div className="container-page py-14 sm:py-16">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
          <h2 id="solutions-strip-title" className="type-h3 text-xl sm:text-2xl">
            {s.title}
          </h2>
          <p className="text-sm text-slate">{s.text}</p>
        </div>
        <ul className="mt-8 grid gap-4 md:grid-cols-3" data-testid="core-verticals">
          {core.map(({ key, href, icon: Icon, tone }) => (
            <li key={key}>
              <Link href={localizePath(locale, href)} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-float">
                <span className={cn("grid size-12 place-items-center rounded-xl", iconTones[tone])}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <h3 className="type-h3 mt-4 text-lg">{s.core[key].title}</h3>
                <p className="mt-2 flex-1 text-sm text-slate">{format(s.core[key].text, vars)}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700">
                  {s.core[key].cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <ul className="mt-8 grid grid-cols-4 gap-1 sm:gap-3 lg:grid-cols-8">
          {solutions.map(({ key, slug, icon, tone }) => (
            <li key={slug}>
              <IndustryCard href={localizePath(locale, landingKey(slug) ? landingPath(slug) : `/solutions#${slug}`)} name={t.solutions.items[key].name} icon={icon} tone={tone} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
