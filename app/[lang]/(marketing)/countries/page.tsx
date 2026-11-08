import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { JsonLd } from "@/components/seo/json-ld";
import { COUNTRY_PAGES } from "@/config/countries";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { countryVars } from "@/lib/marketing/country-copy";
import { breadcrumbGraph } from "@/lib/seo/structured-data";

export const generateMetadata = () => pageMetadata("countries", "/countries");

/** Every country WazaBolt sells in: Cameroon (the home page) and a page for each of the others. */
export default async function CountriesPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const c = t.countryPages;
  const items = [
    { href: "/", code: "CM" as const },
    ...COUNTRY_PAGES.map((p) => ({ href: `/countries/${p.slug}`, code: p.code })),
  ];
  return (
    <>
      <JsonLd graph={[breadcrumbGraph(locale, t, [{ name: c.breadcrumb, path: "/countries" }])]} />
      <PageIntro eyebrow={c.breadcrumb} title={c.indexTitle} description={c.indexLead} />
      <section className="container-page max-w-4xl pb-16">
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="country-list">
          {items.map((i) => {
            const v = countryVars(locale, t, i.code);
            return (
              <li key={i.code}>
                <Link href={localizePath(locale, i.href)} className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-card transition-colors hover:border-waza-500">
                  <span>
                    <span className="font-display text-lg font-bold text-deep">{v.country}</span>
                    <span className="mt-1 block text-sm text-slate">{format(c.indexItem, v)}</span>
                  </span>
                  <ArrowRight className="mt-1 size-5 shrink-0 text-waza-600 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <CTASection />
    </>
  );
}
