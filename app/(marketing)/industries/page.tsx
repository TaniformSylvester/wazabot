import type { Metadata } from "next";
import { Check } from "lucide-react";

import { FinalCta } from "@/components/marketing/final-cta";
import { PageIntro } from "@/components/marketing/page-intro";
import { industries } from "@/config/industries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Industries",
  description: "How shops, restaurants, hotels, salons, real estate agencies, schools and service businesses use WazaBot.",
};

export default function IndustriesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Industries"
        title="Built for the way your business sells"
        description="If your customers message you on WhatsApp, WazaBot can help answer them."
      />
      <section className="container-page py-16">
        <ul className="grid gap-5 md:grid-cols-2">
          {industries.map(({ slug, name, icon: Icon, tone, useCases, exampleQuestion }) => (
            <li
              key={slug}
              id={slug}
              className="scroll-mt-24 rounded-3xl border border-border bg-white p-6 shadow-card sm:p-8"
            >
              <div className="flex items-center gap-4">
                <span className={cn("grid size-14 place-items-center rounded-full", tone)}>
                  <Icon className="size-7" aria-hidden />
                </span>
                <h2 className="text-2xl font-bold">{name}</h2>
              </div>
              <p className="mt-5 inline-block rounded-2xl rounded-tr-md bg-wa-out px-4 py-2 text-sm text-deep">
                “{exampleQuestion}”
              </p>
              <ul className="mt-5 space-y-2">
                {useCases.map((u) => (
                  <li key={u} className="flex items-start gap-2 text-[0.9375rem] text-slate-waza">
                    <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden />
                    {u}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <FinalCta />
    </>
  );
}
