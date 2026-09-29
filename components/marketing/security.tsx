import { BookOpenCheck, Building2, Hand, KeyRound, LockKeyhole } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";

const points = [
  { icon: LockKeyhole, title: "Secure authentication", text: "Dashboard sign-in with secure sessions. Only your team can get in." },
  { icon: Building2, title: "Tenant-isolated data", text: "Every record is tied to your business. Other businesses can't see your data." },
  { icon: KeyRound, title: "Protected API credentials", text: "WhatsApp and AI keys stay on our servers — never in the browser or in logs." },
  { icon: Hand, title: "Human control", text: "You decide when automation answers. Take over, pause or hand back in one tap." },
  { icon: BookOpenCheck, title: "Business-specific knowledge", text: "The AI answers from your information only, and says so when it doesn't know." },
];

export function Security() {
  return (
    <section aria-labelledby="security-title" className="border-y border-border bg-card py-20 sm:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <SectionHeading
          align="left"
          id="security-title"
          eyebrow="Trust"
          title={
            <>
              Your business data <Highlight>belongs to you.</Highlight>
            </>
          }
          description="Your customers trust you with their messages. WazaBolt is built so you stay in control of that trust."
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {points.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 60} className={i === points.length - 1 ? "sm:col-span-2" : undefined}>
              <div className="flex h-full gap-4 rounded-2xl border border-border bg-cream p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-deep text-waza-400">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="type-h3 text-base">{title}</h3>
                  <p className="type-small mt-1 text-slate">{text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
