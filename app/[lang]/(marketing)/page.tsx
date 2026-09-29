import { CTASection } from "@/components/marketing/cta-section";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LanguagesSection } from "@/components/marketing/languages-section";
import { LiveDemo } from "@/components/marketing/live-demo";
import { Platform } from "@/components/marketing/platform";
import { Pricing } from "@/components/marketing/pricing";
import { Problem } from "@/components/marketing/problem";
import { Security } from "@/components/marketing/security";
import { SolutionsStrip } from "@/components/marketing/solutions-strip";
import { siteConfig } from "@/config/site";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export default async function HomePage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const url = `${siteConfig.url}${localizePath(locale, "/")}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: siteConfig.name,
        url: siteConfig.url,
        logo: `${siteConfig.url}/logo/wazabolt-icon-512.png`,
        slogan: t.common.brand.tagline,
      },
      {
        "@type": "SoftwareApplication",
        name: siteConfig.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: t.meta.siteDescription,
        url,
        inLanguage: locale,
        availableLanguage: ["en", "fr"],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Hero />
      <SolutionsStrip />
      <Problem />
      <HowItWorks />
      <LiveDemo />
      <LanguagesSection />
      <Features />
      <Platform />
      <DashboardPreview />
      <Pricing />
      <Security />
      <Faq />
      <CTASection />
    </>
  );
}
