import type { Metadata } from "next";
import { Check } from "lucide-react";

import { FinalCta } from "@/components/marketing/final-cta";
import { PageIntro } from "@/components/marketing/page-intro";
import { Reveal } from "@/components/motion/reveal";
import { solutions, tones } from "@/config/solutions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "How shops, restaurants, hotels, salons, real estate agencies, schools and service businesses use WazaBolt on WhatsApp.",
};

export default function SolutionsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Solutions"
        title="Built for the way your business sells"
        description="If your customers message you on WhatsApp, WazaBolt can help you answer, sell and follow up."
      />
      <section className="container-page py-16">
        <ul className="grid gap-5 md:grid-cols-2">
          {solutions.map(({ slug, name, icon: Icon, tone, useCases, exampleQuestion }, i) => (
            <Reveal as="li" key={slug} delay={(i % 2) * 80}>
              <div id={slug} className="h-full scroll-mt-24 rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
                <div className="flex items-center gap-4">
                  <span className={cn("grid size-14 place-items-center rounded-2xl", tones[tone])}>
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <h2 className="type-h3 text-2xl">{name}</h2>
                </div>
                <p className="mt-5 inline-block rounded-2xl rounded-tl-sm border border-border bg-sand px-4 py-2 text-sm text-ink">
                  “{exampleQuestion}”
                </p>
                <ul className="mt-5 space-y-2">
                  {useCases.map((u) => (
                    <li key={u} className="type-body flex items-start gap-2 text-stone">
                      <Check className="mt-1 size-4 shrink-0 text-ember-600" aria-hidden />
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>
      <FinalCta />
    </>
  );
}
