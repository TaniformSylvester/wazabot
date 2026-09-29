import {
  BookOpen,
  CalendarClock,
  ChartColumn,
  CreditCard,
  Hand,
  Languages,
  Megaphone,
  MessageCircle,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";

import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { FeatureCard } from "@/components/marketing/feature-card";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";
import type { IconTone } from "@/lib/brand/tones";

/** Core features — the capabilities WazaBolt is being built to deliver in its first release. */
const features: { icon: typeof MessageCircle; title: string; text: string; tone: IconTone }[] = [
  { icon: MessageCircle, title: "Answer Customers", text: "AI handles repetitive customer questions, any time of day.", tone: "green" },
  { icon: Package, title: "Share Products", text: "Customers discover your products and verified prices in the chat.", tone: "gold" },
  { icon: ShoppingCart, title: "Capture Orders", text: "Turn conversations into structured orders your team can fulfil.", tone: "coral" },
  { icon: Users, title: "Manage Customers", text: "Keep every customer's details and history organised.", tone: "teal" },
  { icon: Hand, title: "Human Takeover", text: "A staff member can take over any conversation at any time.", tone: "deep" },
  { icon: BookOpen, title: "Business Knowledge", text: "Teach WazaBolt your FAQs, services and policies.", tone: "green" },
  { icon: ChartColumn, title: "Analytics", text: "Understand conversations, customers and orders.", tone: "gold" },
  { icon: Languages, title: "English + French", text: "Supports both major business languages used in Cameroon.", tone: "teal" },
];

/** Not in the first release — always labelled as planned. */
const planned = [
  { icon: CalendarClock, label: "Appointment booking" },
  { icon: Megaphone, label: "Broadcasts to opted-in customers" },
  { icon: CreditCard, label: "Mobile Money payments" },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="features-title"
          eyebrow="Features"
          title="A business assistant, not just a chatbot"
          description="WazaBolt handles the routine work so you and your team can focus on the customers who need a person."
        />
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal as="li" key={f.title} delay={(i % 4) * 70}>
              <FeatureCard {...f} />
            </Reveal>
          ))}
        </ul>
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-white/60 p-5 sm:flex-row sm:flex-wrap sm:justify-center">
          <WazaBoltBadge tone="gold" icon={false} className="uppercase tracking-wider">Planned</WazaBoltBadge>
          {planned.map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-2 text-sm text-slate">
              <Icon className="size-4 text-slate" aria-hidden /> {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
