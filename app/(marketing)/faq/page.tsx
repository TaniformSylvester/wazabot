import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/cta-section";
import { Faq } from "@/components/marketing/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about WazaBolt, WhatsApp and AI conversations.",
};

export default function FaqPage() {
  return (
    <>
      <Faq />
      <CTASection />
    </>
  );
}
