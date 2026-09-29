import { CTASection } from "@/components/marketing/cta-section";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Features } from "@/components/marketing/features";
import { LanguagesSection } from "@/components/marketing/languages-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { Security } from "@/components/marketing/security";
import { getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("features", "/features");

export default async function FeaturesPage() {
  const t = (await getMessages()).pages.features;
  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <Features />
      <LanguagesSection />
      <DashboardPreview />
      <Security />
      <CTASection />
    </>
  );
}
