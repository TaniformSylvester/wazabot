import Link from "next/link";
import { ArrowRight, BookOpen, LifeBuoy, PlayCircle } from "lucide-react";

import { Faq } from "@/components/marketing/faq";
import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = () => pageMetadata("resources", "/resources");

const resources = [
  { key: "how", icon: PlayCircle, href: "/how-it-works" },
  { key: "guides", icon: BookOpen, href: null },
  { key: "help", icon: LifeBuoy, href: "/contact" },
] as const;

export default async function ResourcesPage() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const t = messages.pages.resources;
  return (
    <>
      <PageIntro
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />
      <section className="container-page py-12">
        <ul className="grid gap-5 md:grid-cols-3">
          {resources.map(({ key, icon: Icon, href }) => {
            const { title, text, cta } = t.items[key];
            return (
            <li key={key} className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="grid size-12 place-items-center rounded-xl bg-mint text-waza-700">
                <Icon className="size-6" aria-hidden />
              </span>
              <h2 className="type-h3 mt-5 text-lg">{title}</h2>
              <p className="type-body mt-2 flex-1 text-slate">{text}</p>
              {href ? (
                <Link href={localizePath(locale, href)} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700">
                  {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              ) : (
                <span className="mt-5 text-sm font-semibold text-slate">{cta}</span>
              )}
            </li>
            );
          })}
        </ul>
      </section>
      <Faq />
      <CTASection />
    </>
  );
}
