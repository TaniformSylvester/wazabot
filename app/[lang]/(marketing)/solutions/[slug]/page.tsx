import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { LANDING_SLUGS, landingKey } from "@/config/solutions";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { alternatesFor, socialFor } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { breadcrumbGraph, faqGraph } from "@/lib/seo/structured-data";

export function generateStaticParams() {
  return LANDING_SLUGS.map((slug) => ({ slug }));
}

// Only the business types with their own page exist; the rest stay on /solutions.
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/solutions/[slug]">) {
  const [locale, t, { slug }] = await Promise.all([getLocale(), getMessages(), params]);
  const key = landingKey(slug);
  if (!key) return {};
  const page = t.landing.pages[key];
  const path = `/solutions/${slug}`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: alternatesFor(locale, path),
    ...socialFor(locale, t, { title: page.metaTitle, description: page.metaDescription, path }),
  };
}

/** A landing page for one business type (shops, schools, restaurants): what WazaBolt does for it, and its questions. */
export default async function SolutionPage({ params }: PageProps<"/[lang]/solutions/[slug]">) {
  const [locale, t, { slug }] = await Promise.all([getLocale(), getMessages(), params]);
  const key = landingKey(slug);
  if (!key) notFound();
  const l = t.landing;
  const page = l.pages[key];
  const path = `/solutions/${slug}`;
  return (
    <>
      <JsonLd graph={[faqGraph(page.faq), breadcrumbGraph(locale, t, [{ name: l.breadcrumb, path: "/solutions" }, { name: page.eyebrow, path }])]} />
      <PageIntro eyebrow={page.eyebrow} title={page.title} description={page.lead} />
      <div className="container-page flex justify-center pb-4">
        <Button asChild size="lg" className="group">
          <Link href={localizePath(locale, "/register")}>
            {l.start}
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>

      <section aria-labelledby="landing-features" className="container-page py-16">
        <h2 id="landing-features" className="type-h2 text-center">
          {l.featuresTitle}
        </h2>
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3" data-testid="landing-features">
          {page.features.map((f) => (
            <li key={f.title} className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <h3 className="type-h3 flex items-start gap-2 text-lg">
                <Check className="mt-1 size-5 shrink-0 text-waza-600" aria-hidden />
                {f.title}
              </h3>
              <p className="type-body mt-2 text-slate">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="landing-faq" className="container-page max-w-3xl pb-8">
        <h2 id="landing-faq" className="type-h2 text-center">
          {l.faqTitle}
        </h2>
        <dl className="mt-8 flex flex-col gap-3">
          {page.faq.map((f) => (
            <div key={f.q} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <dt className="font-display font-semibold text-deep">{f.q}</dt>
              <dd className="type-body mt-2 text-slate">{f.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-center">
          <Link href={localizePath(locale, "/solutions")} className="font-semibold text-waza-700 hover:underline">
            {l.seeAll}
          </Link>
        </p>
      </section>
      <CTASection />
    </>
  );
}
