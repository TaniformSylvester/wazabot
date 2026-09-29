import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";

export const metadata: Metadata = {
  title: "About",
  description: "WazaBolt builds WhatsApp business automation for African businesses, starting in Cameroon.",
};

const principles = [
  {
    title: "Built for African businesses",
    text: "Prices in FCFA, replies in English and French, and a product designed around how businesses here already sell: on WhatsApp.",
  },
  {
    title: "Honest automation",
    text: "WazaBolt only answers from information a business has given it. When it can't confirm something, it says so and brings in a person.",
  },
  {
    title: "Your team stays in charge",
    text: "Automation handles the routine. People handle the rest — and can take over any conversation at any moment.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About WazaBolt"
        title="Helping African businesses move at the speed of their customers"
        description="WazaBolt is a business automation platform that helps companies use WhatsApp to answer customers, take orders and grow. We're starting in Cameroon and building for the whole continent."
      />
      <section className="container-page py-16">
        <ul className="grid gap-5 md:grid-cols-3">
          {principles.map((p, i) => (
            <li key={p.title} className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="font-display text-4xl font-extrabold text-waza-500">0{i + 1}</span>
              <h2 className="type-h3 mt-4 text-lg">{p.title}</h2>
              <p className="type-body mt-2 text-slate">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>
      <CTASection />
    </>
  );
}
