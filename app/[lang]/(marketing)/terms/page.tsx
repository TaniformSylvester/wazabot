import { LegalPage } from "@/components/marketing/legal-page";
import { getLocale } from "@/lib/i18n/dictionaries";
import { termsOfService } from "@/lib/legal/terms";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("terms", "/terms");

export default async function Page() {
  const locale = await getLocale();
  return <LegalPage doc={termsOfService[locale]} locale={locale} />;
}
