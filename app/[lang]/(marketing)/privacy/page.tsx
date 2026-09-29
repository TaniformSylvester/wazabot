import { ComingSoon } from "@/components/marketing/coming-soon";
import { getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("privacy", "/privacy");

export default async function Page() {
  const t = await getMessages();
  return <ComingSoon title={t.meta.pages.privacy.title} />;
}
