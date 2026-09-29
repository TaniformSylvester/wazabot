import { ArrowDown, ArrowRight, BookOpen, Hand, Link2, MessageCircle, Store, UserRound } from "lucide-react";

import { WazaBoltIcon } from "@/components/brand/logo";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";
import { getMessages } from "@/lib/i18n/dictionaries";

const steps = [
  { key: "connect", icon: Link2 },
  { key: "add", icon: BookOpen },
  { key: "respond", icon: MessageCircle },
  { key: "takeover", icon: Hand },
] as const;

const flow = [
  { key: "customer", icon: UserRound, tone: "bg-white text-deep border border-line" },
  { key: "whatsapp", icon: MessageCircle, tone: "bg-white text-deep border border-line" },
  { key: "wazabolt", icon: null, tone: "bg-deep text-white" },
  { key: "business", icon: Store, tone: "bg-waza-500 text-deep" },
] as const;

export async function HowItWorks() {
  const t = (await getMessages()).howItWorks;
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="how-title"
          eyebrow={t.eyebrow}
          title={t.title}
          description={t.description}
        />

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ key, icon: Icon }, i) => (
            <Reveal as="li" key={key} delay={i * 80}>
              <div className="group relative h-full rounded-2xl border border-line bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-float">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-xl bg-mint text-waza-700 transition-colors group-hover:bg-waza-500 group-hover:text-deep">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="font-display text-4xl font-extrabold text-waza-100">0{i + 1}</span>
                </div>
                <h3 className="type-h3 mt-5 text-lg">{t.steps[key].title}</h3>
                <p className="type-body mt-2 text-slate">{t.steps[key].text}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <div className="mt-8 rounded-2xl border border-waza-100 bg-mint p-6 sm:p-8">
          <p className="text-center text-sm font-semibold text-slate">{t.flowTitle}</p>
          <ol className="mt-5 flex flex-col items-center justify-center gap-2 md:flex-row md:gap-3">
            {flow.map(({ key, icon: Icon, tone }, i) => (
              <li key={key} className="flex flex-col items-center gap-2 md:flex-row md:gap-3">
                <span className={`flex items-center gap-2.5 rounded-full py-2 pl-2 pr-5 font-semibold shadow-card ${tone}`}>
                  <span className="grid size-8 place-items-center rounded-full bg-black/5">
                    {Icon ? <Icon className="size-4.5" aria-hidden /> : <WazaBoltIcon tone="dark" className="size-7" />}
                  </span>
                  {t.flow[key]}
                </span>
                {i < flow.length - 1 ? (
                  <>
                    <ArrowDown className="size-5 text-waza-600 md:hidden" aria-hidden />
                    <ArrowRight className="hidden size-5 text-waza-600 md:block" aria-hidden />
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
