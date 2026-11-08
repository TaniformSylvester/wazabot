import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { COUNTRY_PAGES, COUNTRY_SLUGS, countryPageFor } from "@/config/countries";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatAmount } from "@/lib/i18n/format";
import { alternatesFor, socialFor } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { countryVars, usdPlans } from "@/lib/marketing/country-copy";
import { breadcrumbGraph, countrySoftwareGraph, faqGraph } from "@/lib/seo/structured-data";

export function generateStaticParams() {
  return COUNTRY_SLUGS.map((slug) => ({ slug }));
}

// Only the countries WazaBolt sells in have a page.
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/countries/[slug]">) {
  const [locale, t, { slug }] = await Promise.all([getLocale(), getMessages(), params]);
  const page = countryPageFor(slug);
  if (!page) return {};
  const c = t.countryPages;
  const v = countryVars(locale, t, page.code, page);
  const title = format(c.metaTitle, v);
  const description = format(c.metaDescription, v);
  const path = `/countries/${slug}`;
  return { title, description, alternates: alternatesFor(locale, path), ...socialFor(locale, t, { title, description, path }) };
}

/** WazaBolt in one country outside Cameroon: its currency, phone numbers and US dollar prices, and its questions. */
export default async function CountryPage({ params }: PageProps<"/[lang]/countries/[slug]">) {
  const [locale, t, { slug }] = await Promise.all([getLocale(), getMessages(), params]);
  const page = countryPageFor(slug);
  if (!page) notFound();
  const c = t.countryPages;
  const v = countryVars(locale, t, page.code, page);
  const path = `/countries/${slug}`;
  const faq = c.faq.map((f) => ({ q: format(f.q, v), a: format(f.a, v) }));
  const plans = usdPlans();
  return (
    <>
      <JsonLd
        graph={[
          countrySoftwareGraph(locale, t, { country: c.names[page.code].name, path, prices: plans.map((p) => ({ id: p.id, monthly: p.monthlyPrice })) }),
          faqGraph(faq),
          breadcrumbGraph(locale, t, [
            { name: c.breadcrumb, path: "/countries" },
            { name: v.country, path },
          ]),
        ]}
      />
      <PageIntro eyebrow={format(c.eyebrow, v)} title={format(c.title, v)} description={format(c.lead, v)} />
      <div className="container-page flex justify-center pb-4">
        <Button asChild size="lg" className="group">
          <Link href={`${localizePath(locale, "/register")}?country=${page.code}`} data-testid="country-start">
            {format(c.start, v)}
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>

      <section aria-labelledby="country-features" className="container-page py-16">
        <h2 id="country-features" className="type-h2 text-center">
          {format(c.featuresTitle, v)}
        </h2>
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3" data-testid="country-features">
          {c.features.map((f) => (
            <li key={f.title} className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <h3 className="type-h3 flex items-start gap-2 text-lg">
                <Check className="mt-1 size-5 shrink-0 text-waza-600" aria-hidden />
                {format(f.title, v)}
              </h3>
              <p className="type-body mt-2 text-slate">{format(f.text, v)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="country-pricing" className="container-page max-w-4xl pb-16">
        <h2 id="country-pricing" className="type-h2 text-center">
          {format(c.pricingTitle, v)}
        </h2>
        <p className="type-body mx-auto mt-3 max-w-2xl text-center text-slate">{c.pricingText}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3" data-testid="country-prices">
          {plans.map((p) => (
            <li key={p.id} className="rounded-2xl border border-border bg-card p-5 text-center shadow-card">
              <p className="font-display text-lg font-bold text-deep">{t.pricing.plans[p.id].name}</p>
              <p className="mt-2 font-display text-2xl font-bold text-deep">
                {formatAmount(p.monthlyPrice, "USD", locale)}
                <span className="text-sm font-normal text-slate">{c.perMonth}</span>
              </p>
              <p className="mt-1 text-xs text-slate">{t.pricing.plans[p.id].description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-sm text-slate">
          {c.yearly}{" "}
          <Link href={localizePath(locale, "/pricing")} className="font-semibold text-waza-700 hover:underline">
            {c.seePricing}
          </Link>
        </p>
      </section>

      <section aria-labelledby="country-faq" className="container-page max-w-3xl pb-8">
        <h2 id="country-faq" className="type-h2 text-center">
          {format(c.faqTitle, v)}
        </h2>
        <dl className="mt-8 flex flex-col gap-3">
          {faq.map((f) => (
            <div key={f.q} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <dt className="font-display font-semibold text-deep">{f.q}</dt>
              <dd className="type-body mt-2 text-slate">{f.a}</dd>
            </div>
          ))}
        </dl>
        <nav aria-label={c.otherCountries} className="mt-10 text-center">
          <p className="type-label text-slate">{c.otherCountries}</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
            <li>
              <Link href={localizePath(locale, "/")} className="font-semibold text-waza-700 hover:underline">
                {c.cameroon}
              </Link>
            </li>
            {COUNTRY_PAGES.filter((o) => o.slug !== slug).map((o) => (
              <li key={o.slug}>
                <Link href={localizePath(locale, `/countries/${o.slug}`)} className="font-semibold text-waza-700 hover:underline">
                  {c.names[o.code].name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>
      <CTASection />
    </>
  );
}
