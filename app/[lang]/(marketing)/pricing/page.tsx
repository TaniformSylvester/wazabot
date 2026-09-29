import { CTASection } from "@/components/marketing/cta-section";
import { Faq } from "@/components/marketing/faq";
import { PageIntro } from "@/components/marketing/page-intro";
import { Pricing } from "@/components/marketing/pricing";
import { getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("pricing", "/pricing");

export default async function PricingPage() {
  const t = (await getMessages()).pages.pricing;
  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <Pricing />
      <Faq />
      <CTASection />
    </>
  );
}
