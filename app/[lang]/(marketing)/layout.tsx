import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getMessages } from "@/lib/i18n/dictionaries";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getMessages();
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-deep px-4 py-2 text-cream focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t.common.nav.skipToContent}
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
