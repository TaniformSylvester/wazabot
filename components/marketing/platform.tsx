import { Ban, ChartColumn, Check, MessageCircle, Package, ShoppingCart } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";

const pillars = [
  {
    icon: MessageCircle,
    name: "Answer",
    text: "Reply to routine questions instantly — day and night — from the information you've given WazaBolt.",
    points: ["FAQs, hours and location", "English and French"],
  },
  {
    icon: Package,
    name: "Share",
    text: "Show products, prices and availability straight from your catalogue, right in the chat.",
    points: ["Product cards with prices", "Verified prices only"],
  },
  {
    icon: ShoppingCart,
    name: "Capture",
    text: "Turn “I want this” into a structured order your team can confirm and deliver.",
    points: ["Order details collected", "Human takeover any time"],
  },
  {
    icon: ChartColumn,
    name: "Grow",
    text: "See what customers ask for, when they message and which conversations become orders.",
    points: ["Conversation and order analytics", "Customer records"],
  },
];

const never = [
  "Invent a price, stock level or delivery fee",
  "Confirm a payment it hasn't seen",
  "Approve refunds or make promises for you",
];

/** Dark Deep Teal contrast section. */
export function Platform() {
  return (
    <section aria-labelledby="platform-title" className="bg-geo-light relative overflow-hidden bg-deep py-20 sm:py-28">
      <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full bg-waza-500/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-24 -left-24 size-80 rounded-full bg-gold/10 blur-3xl" />
      <div className="container-page relative">
        <SectionHeading
          tone="dark"
          id="platform-title"
          eyebrow="Always on"
          title={
            <>
              Your business never stops. <Highlight tone="dark">Neither should your customer service.</Highlight>
            </>
          }
          description="WazaBolt works inside your business WhatsApp as an AI business assistant — not just a chatbot."
          className="max-w-3xl"
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, name, text, points }, i) => (
            <Reveal as="li" key={name} delay={i * 80}>
              <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-deep-800 p-6 transition-colors duration-300 hover:border-waza-500/60">
                <span className="grid size-12 place-items-center rounded-xl border border-waza-400/40 text-waza-400 transition-colors duration-300 group-hover:bg-waza-500 group-hover:text-deep">
                  <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                </span>
                <h3 className="mt-6 font-display text-2xl font-bold text-white">{name}</h3>
                <p className="type-body mt-2 text-white/70">{text}</p>
                <ul className="mt-5 space-y-2 border-t border-white/10 pt-5">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-white/85">
                      <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-gold/30 bg-gold/10 p-6 md:flex-row md:items-center md:gap-8">
          <p className="flex shrink-0 items-center gap-2 font-display font-bold text-gold">
            <Ban className="size-5" aria-hidden /> What WazaBolt will never do
          </p>
          <ul className="flex flex-1 flex-col gap-2 text-sm text-white/85 md:flex-row md:flex-wrap md:gap-x-6">
            {never.map((item) => (
              <li key={item}>— {item}</li>
            ))}
          </ul>
          <p className="text-sm text-white/60 md:max-w-52">If it can&apos;t confirm something, it brings in your team.</p>
        </div>
      </div>
    </section>
  );
}
