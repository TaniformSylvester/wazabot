import { CTASection } from "@/components/marketing/cta-section";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LiveDemo } from "@/components/marketing/live-demo";
import { Platform } from "@/components/marketing/platform";
import { Pricing } from "@/components/marketing/pricing";
import { Problem } from "@/components/marketing/problem";
import { Security } from "@/components/marketing/security";
import { SolutionsStrip } from "@/components/marketing/solutions-strip";
import { siteConfig } from "@/config/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      logo: `${siteConfig.url}/logo/wazabolt-icon-512.png`,
      slogan: siteConfig.tagline,
    },
    {
      "@type": "SoftwareApplication",
      name: siteConfig.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: siteConfig.description,
      url: siteConfig.url,
    },
  ],
};

export default function HomePage() {
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
