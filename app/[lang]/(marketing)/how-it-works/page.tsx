import { CTASection } from "@/components/marketing/cta-section";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LiveDemo } from "@/components/marketing/live-demo";
import { PageIntro } from "@/components/marketing/page-intro";
import { Platform } from "@/components/marketing/platform";
import { getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("howItWorks", "/how-it-works");

export default async function HowItWorksPage() {
  const t = (await getMessages()).pages.howItWorks;
  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <HowItWorks />
      <LiveDemo />
      <Platform />
      <DashboardPreview />
      <CTASection />
    </>
  );
}
