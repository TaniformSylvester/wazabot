import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { organizationGraph } from "@/lib/seo/structured-data";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <>
      <JsonLd graph={organizationGraph(locale, t)} />
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
