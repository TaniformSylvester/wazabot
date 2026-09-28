import type { Metadata } from "next";

import { FinalCta } from "@/components/marketing/final-cta";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PageIntro } from "@/components/marketing/page-intro";
import { WhatsAppDemo } from "@/components/marketing/whatsapp-demo";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Connect WhatsApp, add your business information, let WazaBot answer and take over anytime.",
};

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        title="From first message to finished order"
        description="Here's what happens when a customer messages your business."
      />
      <HowItWorks />
      <WhatsAppDemo />
      <FinalCta />
    </>
  );
}
