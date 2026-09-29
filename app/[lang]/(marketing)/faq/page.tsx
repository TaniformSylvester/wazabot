import { CTASection } from "@/components/marketing/cta-section";
import { Faq } from "@/components/marketing/faq";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("faq", "/faq");

export default function FaqPage() {
  return (
    <>
      <Faq />
      <CTASection />
    </>
  );
}
