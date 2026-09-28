import type { Metadata } from "next";

import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { FinalCta } from "@/components/marketing/final-cta";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LiveDemo } from "@/components/marketing/live-demo";
import { PageIntro } from "@/components/marketing/page-intro";
import { Platform } from "@/components/marketing/platform";

export const metadata: Metadata = {
  title: "Product",
  description:
    "How WazaBolt works: connect your business WhatsApp account, add your business information, automate replies and orders, and take over anytime.",
};

export default function ProductPage() {
  return (
    <>
      <PageIntro
        eyebrow="Product"
        title="From first message to finished order"
        description="WazaBolt connects to your business WhatsApp account and turns conversations into answers, orders and loyal customers."
      />
      <HowItWorks />
      <Platform />
      <LiveDemo />
      <DashboardPreview />
      <FinalCta />
    </>
  );
}
