import { Ban, ChartColumn, Check, ShoppingBag, Users, Zap } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";

const pillars = [
  {
    icon: Zap,
    name: "Automate",
    text: "Answer routine questions instantly with automated replies and an AI assistant trained on your business.",
    points: ["FAQs, hours and location", "Replies in English or French"],
  },
  {
    icon: ShoppingBag,
    name: "Sell",
    text: "Share products and prices from your catalogue and capture orders inside the conversation.",
    points: ["Product catalogue", "Order capture and tracking"],
  },
  {
    icon: Users,
    name: "Manage",
    text: "Every customer, conversation and order in one dashboard — with your team one tap away.",
    points: ["Customer records and notes", "Human takeover anytime"],
  },
  {
    icon: ChartColumn,
    name: "Grow",
    text: "See what customers ask for, when they message and which conversations turn into orders.",
    points: ["Conversation and order analytics", "Broadcasts (coming soon)"],
  },
];

const never = [
  "Invent a price, stock level or delivery fee",
  "Confirm a payment it hasn't seen",
  "Approve refunds or make promises for you",
];

export function Platform() {
  return (
    <section aria-labelledby="platform-title" className="bg-geo-light bg-ink py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          tone="dark"
          id="platform-title"
          eyebrow="The platform"
          title={
            <>
              From first message to <Highlight tone="dark">finished order.</Highlight>
            </>
          }
          description="WazaBolt turns your business WhatsApp into a complete sales and service channel — not just a chatbot."
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, name, text, points }, i) => (
            <Reveal as="li" key={name} delay={i * 80}>
              <div className="group flex h-full flex-col rounded-3xl border border-sand/10 bg-ink-800 p-6 transition-colors duration-300 hover:border-bolt-500/60">
                <span className="grid size-12 place-items-center rounded-2xl bg-bolt-500 text-ink transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
                  <Icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-6 font-display text-2xl font-bold text-sand">{name}</h3>
                <p className="type-body mt-2 text-sand/70">{text}</p>
                <ul className="mt-5 space-y-2 border-t border-sand/10 pt-5">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-sand/85">
                      <Check className="mt-0.5 size-4 shrink-0 text-bolt-400" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-bolt-500/30 bg-bolt-500/10 p-6 md:flex-row md:items-center md:gap-8">
          <p className="flex shrink-0 items-center gap-2 font-display font-bold text-bolt-400">
            <Ban className="size-5" aria-hidden /> What the AI will never do
          </p>
          <ul className="flex flex-1 flex-col gap-2 text-sm text-sand/85 md:flex-row md:flex-wrap md:gap-x-6">
            {never.map((item) => (
              <li key={item}>— {item}</li>
            ))}
          </ul>
          <p className="text-sm text-sand/60 md:max-w-52">If it can&apos;t confirm something, it brings in your team.</p>
        </div>
      </div>
    </section>
  );
}
