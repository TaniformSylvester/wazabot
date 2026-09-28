import { BusinessTypes } from "@/components/marketing/business-types";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { Problem } from "@/components/marketing/problem";
import { Security } from "@/components/marketing/security";
import { Solution } from "@/components/marketing/solution";
import { WhatsAppDemo } from "@/components/marketing/whatsapp-demo";

export default function HomePage() {
  return (
    <>
      <Hero />
      <BusinessTypes />
      <Problem />
      <Solution />
      <HowItWorks />
      <WhatsAppDemo />
      <DashboardPreview />
      <Features />
      <Pricing />
      <Security />
      <Faq />
      <FinalCta />
    </>
  );
}
