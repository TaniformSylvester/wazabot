import { ArrowDown, ArrowRight, BookOpen, Link2, MessageSquareText, Store, UserRound } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/brand/whatsapp-icon";
import { SectionHeading } from "@/components/marketing/section-heading";

const steps = [
  {
    icon: Link2,
    title: "Connect WhatsApp",
    text: "Connect your WhatsApp Business account through Meta's official platform. No new number for customers to learn.",
  },
  {
    icon: BookOpen,
    title: "Add your business information",
    text: "Add products, services, FAQs, prices and policies. This is the only information WazaBot answers from.",
  },
  {
    icon: MessageSquareText,
    title: "Let WazaBot answer",
    text: "Customers message your business normally on WhatsApp. WazaBot replies in English or French.",
  },
  {
    icon: UserRound,
    title: "Take over anytime",
    text: "Jump into any conversation from your dashboard. WazaBot pauses until you hand it back.",
  },
];

const flow = [
  { label: "Customer", icon: UserRound, tone: "bg-white text-deep" },
  { label: "WhatsApp", icon: WhatsAppIcon, tone: "bg-waza-500 text-white" },
  { label: "WazaBot", icon: null, tone: "bg-white text-deep" },
  { label: "Your business", icon: Store, tone: "bg-deep text-white" },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Up and running in four steps"
          description="No new app for your customers, and no technical team needed."
        />

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="relative rounded-2xl border border-border bg-white p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-2xl bg-mint text-waza-700">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="font-heading text-4xl font-extrabold text-waza-100">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-slate-waza">{text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-3xl bg-mint p-6 sm:p-8">
          <p className="text-center text-sm font-semibold text-waza-800">How a message travels</p>
          <ol className="mt-5 flex flex-col items-center justify-center gap-2 md:flex-row md:gap-3">
            {flow.map(({ label, icon: Icon, tone }, i) => (
              <li key={label} className="flex flex-col items-center gap-2 md:flex-row md:gap-3">
                <span className={`flex items-center gap-2.5 rounded-full py-2 pl-2 pr-5 font-semibold shadow-card ${tone}`}>
                  <span className="grid size-8 place-items-center rounded-full bg-black/5">
                    {Icon ? <Icon className="size-4.5" aria-hidden /> : <LogoMark className="size-6" />}
                  </span>
                  {label}
                </span>
                {i < flow.length - 1 ? (
                  <>
                    <ArrowDown className="size-5 text-waza-700 md:hidden" aria-hidden />
                    <ArrowRight className="hidden size-5 text-waza-700 md:block" aria-hidden />
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
