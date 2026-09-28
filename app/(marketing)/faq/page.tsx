import type { Metadata } from "next";

import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about WazaBot, WhatsApp and AI conversations.",
};

export default function FaqPage() {
  return (
    <>
      <Faq />
      <FinalCta />
    </>
  );
}
