import { BookOpenCheck, Building2, Hand, KeyRound, LockKeyhole } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";
import { getMessages } from "@/lib/i18n/dictionaries";
import { rich } from "@/lib/i18n/rich";

const points = [
  { key: "auth", icon: LockKeyhole },
  { key: "tenant", icon: Building2 },
  { key: "keys", icon: KeyRound },
  { key: "control", icon: Hand },
  { key: "knowledge", icon: BookOpenCheck },
] as const;

export async function Security() {
  const t = (await getMessages()).security;
  return (
    <section aria-labelledby="security-title" className="border-y border-border bg-card py-20 sm:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <SectionHeading
          align="left"
          id="security-title"
          eyebrow={t.eyebrow}
          title={rich(t.title, { hl: (c) => <Highlight>{c}</Highlight> })}
          description={t.description}
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {points.map(({ key, icon: Icon }, i) => (
            <Reveal as="li" key={key} delay={i * 60} className={i === points.length - 1 ? "sm:col-span-2" : undefined}>
              <div className="flex h-full gap-4 rounded-2xl border border-border bg-cream p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-deep text-waza-400">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="type-h3 text-base">{t.points[key].title}</h3>
                  <p className="type-small mt-1 text-slate">{t.points[key].text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
