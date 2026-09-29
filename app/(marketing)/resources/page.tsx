import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, LifeBuoy, PlayCircle } from "lucide-react";

import { Faq } from "@/components/marketing/faq";
import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides, answers and help for getting your business running on WazaBolt.",
};

const resources = [
  {
    icon: PlayCircle,
    title: "How WazaBolt works",
    text: "A walkthrough of connecting WhatsApp, adding your business information and letting automation respond.",
    href: "/how-it-works",
    cta: "See how it works",
  },
  {
    icon: BookOpen,
    title: "Setup guides",
    text: "Step-by-step guides for connecting your business WhatsApp account and building your catalog.",
    href: null,
    cta: "Coming soon",
  },
  {
    icon: LifeBuoy,
    title: "Help & contact",
    text: "Questions before you start? Reach the WazaBolt team.",
    href: "/contact",
    cta: "Contact us",
  },
];

export default function ResourcesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Resources"
        title="Everything you need to get started"
        description="Answers, guides and help for running your business on WhatsApp with WazaBolt."
      />
      <section className="container-page py-12">
        <ul className="grid gap-5 md:grid-cols-3">
          {resources.map(({ icon: Icon, title, text, href, cta }) => (
            <li key={title} className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="grid size-12 place-items-center rounded-xl bg-mint text-waza-700">
                <Icon className="size-6" aria-hidden />
              </span>
              <h2 className="type-h3 mt-5 text-lg">{title}</h2>
              <p className="type-body mt-2 flex-1 text-slate">{text}</p>
              {href ? (
                <Link href={href} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700">
                  {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              ) : (
                <span className="mt-5 text-sm font-semibold text-slate">{cta}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <Faq />
      <CTASection />
    </>
  );
}
