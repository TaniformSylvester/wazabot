import { plans } from "@/config/plans";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { Messages } from "@/messages/en";

/*
 * schema.org data for search engines (JSON-LD). Only facts that are on the
 * site already: the registered address and contact details, the public plan
 * prices, the FAQ. Nothing made up (no ratings, no review counts).
 */

const ORG_ID = `${siteConfig.url}/#organization`;
const SITE_ID = `${siteConfig.url}/#website`;

/** WazaBolt the business: on every marketing page. */
export function organizationGraph(locale: Locale, t: Messages) {
  const c = siteConfig.contact;
  return [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: siteConfig.name,
      ...(siteConfig.legal.entityName ? { legalName: siteConfig.legal.entityName } : {}),
      url: siteConfig.url,
      logo: `${siteConfig.url}/logo/wazabolt-icon-512.png`,
      slogan: t.common.brand.tagline,
      email: c.email,
      telephone: c.phone,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Mile Six Nkwen, Behind Mawa Hotel",
        addressLocality: "Bamenda",
        addressRegion: "North-West",
        addressCountry: "CM",
      },
      areaServed: { "@type": "Country", name: "Cameroon" },
      contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", telephone: c.phone, email: c.email, availableLanguage: ["English", "French"] }],
      sameAs: [`https://wa.me/${c.whatsappNumber}`],
    },
    {
      "@type": "WebSite",
      "@id": SITE_ID,
      name: siteConfig.name,
      url: siteConfig.url,
      inLanguage: locale,
      publisher: { "@id": ORG_ID },
    },
  ];
}

/** The product with its plans and FCFA prices (home and pricing). */
export function softwareGraph(locale: Locale, t: Messages) {
  return {
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: t.meta.siteDescription,
    url: `${siteConfig.url}${localizePath(locale, "/")}`,
    inLanguage: locale,
    availableLanguage: ["en", "fr"],
    publisher: { "@id": ORG_ID },
    offers: plans.map((p) => ({
      "@type": "Offer",
      name: t.pricing.plans[p.id].name,
      description: t.pricing.plans[p.id].description,
      price: p.monthlyPrice,
      priceCurrency: p.currency,
      url: `${siteConfig.url}${localizePath(locale, "/pricing")}`,
    })),
  };
}

/** Questions and answers shown on the page. */
export function faqGraph(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** Home › page, for search results that show the path. */
export function breadcrumbGraph(locale: Locale, t: Messages, trail: { name: string; path: string }[]) {
  const items = [{ name: t.common.nav.home, path: "/" }, ...trail];
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, item: `${siteConfig.url}${localizePath(locale, x.path)}` })),
  };
}
