import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/cta-section";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Features } from "@/components/marketing/features";
import { PageIntro } from "@/components/marketing/page-intro";
import { Security } from "@/components/marketing/security";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Answer customers, share products, capture orders, manage customers and take over any conversation — WazaBolt, your AI business assistant on WhatsApp.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Features"
        title="More than a chatbot. A business assistant."
        description="WazaBolt answers the routine questions, turns conversations into orders and keeps every customer organised — with your team always in control."
      />
      <Features />
      <DashboardPreview />
      <Security />
      <CTASection />
    </>
  );
}
