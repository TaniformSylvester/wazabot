import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/cta-section";
import { Faq } from "@/components/marketing/faq";
import { PageIntro } from "@/components/marketing/page-intro";
import { Pricing } from "@/components/marketing/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple WazaBolt plans in XAF, from Free to Pro. AI usage is metered — no unlimited surprises.",
};

export default function PricingPage() {
  return (
    <>
      <PageIntro
        eyebrow="Pricing"
        title="Pay for what your customers use"
        description="Every plan is priced in FCFA with a clear monthly allowance of AI conversations."
      />
      <Pricing />
      <Faq />
      <CTASection />
    </>
  );
}
