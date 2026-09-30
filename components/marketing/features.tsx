import {
  BookOpen,
  CalendarClock,
  ChartColumn,
  CreditCard,
  Globe,
  Hand,
  Megaphone,
  MessageCircle,
  Mic,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";

import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { FeatureCard } from "@/components/marketing/feature-card";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";
import type { IconTone } from "@/lib/brand/tones";
import { getMessages } from "@/lib/i18n/dictionaries";
import type { Messages } from "@/messages/en";

/** Core features — the capabilities WazaBolt is being built to deliver in its first release. */
const features: { key: keyof Messages["features"]["items"]; icon: typeof MessageCircle; tone: IconTone }[] = [
  { key: "answer", icon: MessageCircle, tone: "green" },
  { key: "share", icon: Package, tone: "gold" },
  { key: "capture", icon: ShoppingCart, tone: "coral" },
  { key: "customers", icon: Users, tone: "teal" },
  { key: "takeover", icon: Hand, tone: "deep" },
  { key: "knowledge", icon: BookOpen, tone: "green" },
  { key: "analytics", icon: ChartColumn, tone: "gold" },
];

/** Not in the first release — always labelled as planned. */
const planned = [
  { key: "appointments", icon: CalendarClock },
  { key: "broadcasts", icon: Megaphone },
  { key: "mobileMoney", icon: CreditCard },
  { key: "voiceImages", icon: Mic },
  { key: "morePacks", icon: Globe },
] as const;

export async function Features() {
  const [common, t] = await getMessages().then((m) => [m.common, m.features] as const);
  return (
    <section id="features" aria-labelledby="features-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="features-title"
          eyebrow={t.eyebrow}
          title={t.title}
          description={t.description}
        />
        {/* Seven capabilities: 4 + 3, second row centred. */}
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-center">
          {features.map(({ key, icon, tone }, i) => (
            <Reveal as="li" key={key} delay={(i % 4) * 70} className="lg:w-[calc((100%-3rem)/4)]">
              <FeatureCard icon={icon} tone={tone} title={t.items[key].title} text={t.items[key].text} />
            </Reveal>
          ))}
        </ul>
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-white/60 p-5 sm:flex-row sm:flex-wrap sm:justify-center">
          <WazaBoltBadge tone="gold" icon={false} className="uppercase tracking-wider">{common.badges.planned}</WazaBoltBadge>
          {planned.map(({ key, icon: Icon }) => (
            <span key={key} className="inline-flex items-center gap-2 text-sm text-slate">
              <Icon className="size-4 text-slate" aria-hidden /> {t.planned[key]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
