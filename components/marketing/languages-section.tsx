import { Languages, MessagesSquare, SlidersHorizontal, UserRoundCheck } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";
import { getMessages } from "@/lib/i18n/dictionaries";
import { rich } from "@/lib/i18n/rich";

const points = [
  { key: "detect", icon: Languages },
  { key: "mixed", icon: MessagesSquare },
  { key: "preference", icon: UserRoundCheck },
  { key: "style", icon: SlidersHorizontal },
] as const;

const exampleLang = { EN: "en", FR: "fr", Pidgin: "wes" } as const;

/** English, French and Cameroonian Pidgin — how WazaBolt handles languages. */
export async function LanguagesSection() {
  const t = (await getMessages()).languagesSection;
  return (
    <section id="languages" aria-labelledby="languages-title" className="bg-mint/60 py-20 sm:py-28">
      <div className="container-page grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <SectionHeading
            align="left"
            id="languages-title"
            eyebrow={t.eyebrow}
            title={rich(t.title, { hl: (c) => <Highlight>{c}</Highlight> })}
            description={t.description}
          />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {points.map(({ key, icon: Icon }, i) => (
              <Reveal as="li" key={key} delay={i * 60}>
                <div className="flex h-full gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint text-waza-700">
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

        <Reveal className="rounded-3xl border border-line bg-white p-6 shadow-float sm:p-8">
          <p className="type-label text-waza-700">{t.examplesTitle}</p>
          <ul className="mt-5 flex flex-col gap-3">
            {t.examples.map((e) => (
              <li key={e.lang} className="flex items-start gap-3">
                <span className="mt-1 w-14 shrink-0 rounded-full bg-deep px-2 py-0.5 text-center text-[0.6875rem] font-bold text-white">
                  {e.lang}
                </span>
                <p
                  lang={exampleLang[e.lang as keyof typeof exampleLang] ?? undefined}
                  className="rounded-2xl rounded-tl-sm border border-line bg-cream px-3.5 py-2.5 text-sm text-deep"
                >
                  {e.text}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-line pt-4 text-xs text-slate">{t.note}</p>
        </Reveal>
      </div>
    </section>
  );
}
