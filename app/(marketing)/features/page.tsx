import type { Metadata } from "next";

import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageIntro } from "@/components/marketing/page-intro";
import { Security } from "@/components/marketing/security";

export const metadata: Metadata = {
  title: "Features",
  description:
    "WhatsApp automation, an AI customer assistant, product catalog, orders, customer management and analytics — in one platform.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Features"
        title="One platform for your WhatsApp business"
        description="Automate the routine, sell in the conversation and keep every customer organised — with your team always in control."
      />
      <Features />
      <DashboardPreview />
      <Security />
      <FinalCta />
    </>
  );
}
