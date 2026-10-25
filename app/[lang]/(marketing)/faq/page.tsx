import { CTASection } from "@/components/marketing/cta-section";
import { Faq } from "@/components/marketing/faq";
import { JsonLd } from "@/components/seo/json-ld";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { breadcrumbGraph, faqGraph } from "@/lib/seo/structured-data";

export const generateMetadata = () => pageMetadata("faq", "/faq");

export default async function FaqPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <>
      <JsonLd graph={[faqGraph(t.faq.items), breadcrumbGraph(locale, t, [{ name: t.meta.pages.faq.title, path: "/faq" }])]} />
      <Faq level={1} />
      <CTASection />
    </>
  );
}
