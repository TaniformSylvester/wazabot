import { CTASection } from "@/components/marketing/cta-section";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LanguagesSection } from "@/components/marketing/languages-section";
import { LiveDemo } from "@/components/marketing/live-demo";
import { Pricing } from "@/components/marketing/pricing";
import { Problem } from "@/components/marketing/problem";
import { SolutionsStrip } from "@/components/marketing/solutions-strip";
import { JsonLd } from "@/components/seo/json-ld";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { softwareGraph } from "@/lib/seo/structured-data";

export default async function HomePage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <>
      <JsonLd graph={[softwareGraph(locale, t)]} />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <LiveDemo />
      <SolutionsStrip />
      <DashboardPreview />
      <LanguagesSection />
      <Pricing />
      <Faq />
      <CTASection />
    </>
  );
}
