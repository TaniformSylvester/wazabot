import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { Reveal } from "@/components/motion/reveal";
import { landingKey, solutions } from "@/config/solutions";
import { iconTones } from "@/lib/brand/tones";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

export const generateMetadata = () => pageMetadata("solutions", "/solutions");

export default async function SolutionsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const intro = t.pages.solutions;
  return (
    <>
      <PageIntro
        eyebrow={intro.eyebrow}
        title={intro.title}
        description={intro.description}
      />
      <section className="container-page py-16">
        <ul className="grid gap-5 md:grid-cols-2">
          {solutions.map(({ key, slug, icon: Icon, tone }, i) => {
            const { name, useCases, exampleQuestion } = t.solutions.items[key];
            return (
            <Reveal as="li" key={slug} delay={(i % 2) * 80}>
              <div id={slug} className="h-full scroll-mt-24 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
                <div className="flex items-center gap-4">
                  <span className={cn("grid size-14 place-items-center rounded-full", iconTones[tone])}>
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <h2 className="type-h3 text-2xl">{name}</h2>
                </div>
                <p className="mt-5 inline-block rounded-2xl rounded-tr-sm bg-chat-out px-4 py-2 text-sm text-deep">
                  “{exampleQuestion}”
                </p>
                <ul className="mt-5 space-y-2">
                  {useCases.map((u) => (
                    <li key={u} className="type-body flex items-start gap-2 text-slate">
                      <Check className="mt-1 size-4 shrink-0 text-waza-600" aria-hidden />
                      {u}
                    </li>
                  ))}
                </ul>
                {landingKey(slug) ? (
                  <Link href={localizePath(locale, `/solutions/${slug}`)} className="mt-5 inline-flex items-center gap-1.5 font-semibold text-waza-700 hover:underline">
                    {t.landing.learnMore} <span className="sr-only">— {name}</span>
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </Reveal>
            );
          })}
        </ul>
      </section>
      <CTASection />
    </>
  );
}
