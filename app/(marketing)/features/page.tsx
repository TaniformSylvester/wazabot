import type { Metadata } from "next";

import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageIntro } from "@/components/marketing/page-intro";
import { Security } from "@/components/marketing/security";
import { Solution } from "@/components/marketing/solution";

export const metadata: Metadata = {
  title: "Features",
  description: "AI conversations, products, orders, customers and human takeover — all on WhatsApp.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Features"
        title="An AI employee for your WhatsApp"
        description="WazaBot answers, sells and organises — and always hands over to you when a person is needed."
      />
      <Features />
      <Solution />
      <DashboardPreview />
      <Security />
      <FinalCta />
    </>
  );
}
