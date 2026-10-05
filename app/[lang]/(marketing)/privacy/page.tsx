import { LegalPage } from "@/components/marketing/legal-page";
import { getLocale } from "@/lib/i18n/dictionaries";
import { privacyPolicy } from "@/lib/legal/privacy";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("privacy", "/privacy");

export default async function Page() {
  const locale = await getLocale();
  return <LegalPage doc={privacyPolicy[locale]} locale={locale} />;
}
