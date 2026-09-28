import type { Metadata } from "next";

import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageIntro } from "@/components/marketing/page-intro";
import { Pricing } from "@/components/marketing/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple WazaBot plans in XAF, from Free to Pro. AI usage is metered — no unlimited surprises.",
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
      <FinalCta />
    </>
  );
}
