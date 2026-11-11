import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { AudiencePlans } from "@/components/marketing/audience-plans";
import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { alternatesFor, socialFor } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { breadcrumbGraph, faqGraph } from "@/lib/seo/structured-data";

const PATH = "/schools";

export async function generateMetadata() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const s = t.schoolsHome;
  return {
    title: s.metaTitle,
    description: s.metaDescription,
    alternates: alternatesFor(locale, PATH),
    ...socialFor(locale, t, { title: s.metaTitle, description: s.metaDescription, path: PATH }),
  };
}

/**
 * WazaBolt Schools: the front door for schools. School wording only (marks,
 * report cards, fees, teachers), the plans under their school names, and a
 * sign-up that starts a school account. The product is the same platform.
 */
export default async function SchoolsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const s = t.schoolsHome;
  const page = t.landing.pages.schools;
  const register = `${localizePath(locale, "/register")}?type=schools`;
  const faq = [...page.faq, ...s.moreFaq];
  return (
    <>
      <JsonLd graph={[faqGraph(faq), breadcrumbGraph(locale, t, [{ name: s.brand, path: PATH }])]} />
      <PageIntro eyebrow={s.brand} title={s.title} description={s.lead} />
      <div className="container-page flex flex-col items-center gap-3 pb-4">
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="group">
            <Link href={register} data-testid="schools-start">
              {s.start}
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#plans">{s.seePlans}</Link>
          </Button>
        </div>
        <p className="text-sm text-slate">{s.startNote}</p>
      </div>

      <section id="how" aria-labelledby="schools-how" className="container-page scroll-mt-20 py-16">
        <h2 id="schools-how" className="type-h2 text-center">
          {s.howTitle}
        </h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4" data-testid="schools-how">
          {s.how.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="flex size-9 items-center justify-center rounded-full bg-deep font-display text-sm font-bold text-white" aria-hidden>
                {i + 1}
              </span>
              <h3 className="type-h3 mt-4 text-lg">{step.title}</h3>
              <p className="type-body mt-2 text-slate">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" aria-labelledby="schools-features" className="container-page scroll-mt-20 pb-16">
        <h2 id="schools-features" className="type-h2 text-center">
          {s.featuresTitle}
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

      <AudiencePlans audience="school" />

      <section id="faq" aria-labelledby="schools-faq" className="container-page max-w-3xl scroll-mt-20 pb-8 pt-16">
        <h2 id="schools-faq" className="type-h2 text-center">
          {t.landing.faqTitle}
        </h2>
        <dl className="mt-8 flex flex-col gap-3">
          {faq.map((f) => (
            <div key={f.q} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <dt className="font-display font-semibold text-deep">{f.q}</dt>
              <dd className="type-body mt-2 text-slate">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <CTASection title={s.ctaTitle} text={s.ctaText} registerHref={register} secondary={{ href: "#plans", label: s.seePlans }} />
    </>
  );
}
