import type { Metadata } from "next";
import { Check } from "lucide-react";

import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { Reveal } from "@/components/motion/reveal";
import { solutions } from "@/config/solutions";
import { iconTones } from "@/lib/brand/tones";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "How shops, restaurants, hotels, fashion brands, salons, real estate agencies, schools and service businesses use WazaBolt on WhatsApp.",
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
              </div>
            </Reveal>
          ))}
        </ul>
      </section>
      <CTASection />
    </>
  );
}
