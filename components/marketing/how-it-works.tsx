import { ArrowDown, ArrowRight, BookOpen, Hand, Link2, MessageCircle, Store, UserRound } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";

const steps = [
  {
    icon: Link2,
    title: "Connect your WhatsApp",
    text: "Connect your business WhatsApp account to WazaBolt through Meta's official WhatsApp Business Platform.",
  },
  {
    icon: BookOpen,
    title: "Add your business",
    text: "Add products, services, FAQs, prices and policies. This is the only information the AI answers from.",
  },
  {
    icon: MessageCircle,
    title: "Let WazaBolt respond",
    text: "Customers message your business as usual. WazaBolt replies in English or French and captures orders.",
  },
  {
    icon: Hand,
    title: "Take over anytime",
    text: "Jump into any conversation from your dashboard. Automation pauses until you hand it back.",
  },
];

const flow = [
  { label: "Customer", icon: UserRound, tone: "bg-card text-ink border border-border" },
  { label: "WhatsApp", icon: MessageCircle, tone: "bg-card text-ink border border-border" },
  { label: "WazaBolt", icon: null, tone: "bg-ink text-sand" },
  { label: "Your business", icon: Store, tone: "bg-bolt-500 text-ink" },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Live in four steps"
          description="No new app for your customers, and no technical team needed."
        />

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 80}>
              <div className="group relative h-full rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-float">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-bolt-100 text-bolt-800 transition-colors group-hover:bg-bolt-500 group-hover:text-ink">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="font-display text-4xl font-extrabold text-sand-200">0{i + 1}</span>
                </div>
                <h3 className="type-h3 mt-5 text-lg">{title}</h3>
                <p className="type-body mt-2 text-stone">{text}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <div className="mt-8 rounded-3xl border border-border bg-sand-100 p-6 sm:p-8">
          <p className="text-center text-sm font-semibold text-stone">How a message travels</p>
          <ol className="mt-5 flex flex-col items-center justify-center gap-2 md:flex-row md:gap-3">
            {flow.map(({ label, icon: Icon, tone }, i) => (
              <li key={label} className="flex flex-col items-center gap-2 md:flex-row md:gap-3">
                <span className={`flex items-center gap-2.5 rounded-full py-2 pl-2 pr-5 font-semibold shadow-card ${tone}`}>
                  <span className="grid size-8 place-items-center rounded-full bg-sand/10">
                    {Icon ? <Icon className="size-4.5" aria-hidden /> : <LogoMark className="size-7" />}
                  </span>
                  {label}
                </span>
                {i < flow.length - 1 ? (
                  <>
                    <ArrowDown className="size-5 text-ember-600 md:hidden" aria-hidden />
                    <ArrowRight className="hidden size-5 text-ember-600 md:block" aria-hidden />
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
