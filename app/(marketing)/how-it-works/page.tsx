import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/cta-section";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LiveDemo } from "@/components/marketing/live-demo";
import { PageIntro } from "@/components/marketing/page-intro";
import { Platform } from "@/components/marketing/platform";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How WazaBolt works: connect your business WhatsApp account, add your business information, let WazaBolt answer, and take over anytime.",
};

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        title="From first message to finished order"
        description="WazaBolt connects to your business WhatsApp account and turns conversations into answers, orders and loyal customers."
      />
      <HowItWorks />
      <LiveDemo />
      <Platform />
      <DashboardPreview />
      <CTASection />
    </>
  );
}
