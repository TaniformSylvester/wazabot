import { CTASection } from "@/components/marketing/cta-section";
import { Faq } from "@/components/marketing/faq";
import { PageIntro } from "@/components/marketing/page-intro";
import { Pricing } from "@/components/marketing/pricing";
import { JsonLd } from "@/components/seo/json-ld";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { breadcrumbGraph, softwareGraph } from "@/lib/seo/structured-data";

export const generateMetadata = () => pageMetadata("pricing", "/pricing");

export default async function PricingPage() {
  const [locale, all] = await Promise.all([getLocale(), getMessages()]);
  const t = all.pages.pricing;
  return (
    <>
      <JsonLd graph={[softwareGraph(locale, all), breadcrumbGraph(locale, all, [{ name: all.meta.pages.pricing.title, path: "/pricing" }])]} />
      <PageIntro eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <Pricing />
      <Faq />
      <CTASection />
    </>
  );
}
