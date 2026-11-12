/**
 * Brand constants. The English copy here is used where no locale applies
 * (web manifest, generated social images); pages use the dictionaries in
 * messages/ instead.
 */
export const siteConfig = {
  name: "WazaBolt",
  /** Brand descriptor — used under the logo and in social profiles. */
  tagline: "Business management, made for Africa.",
  /** Primary marketing message (hero, CTAs, social). */
  headline: "Power your business on WhatsApp.",
  /** Supporting message. */
  supporting: "Never miss a customer.",
  positioning: "Sales, stock and school software for shops, restaurants and schools",
  title: "WazaBolt — Business management software for shops, restaurants and schools",
  description:
    "WazaBolt is business management software for shops, restaurants and schools: sales, stock, customer credit, invoices and receipts shared on WhatsApp, an online shop page, and marks, report cards and fees for schools. A WhatsApp AI assistant is coming soon.",
  /** Set NEXT_PUBLIC_SITE_URL per environment — never hard-code the deployment URL. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** How to reach the WazaBolt team (Contact page). Shown as written — not translated. */
  contact: {
    phone: "+237 651 57 59 33",
    phoneHref: "tel:+237651575933",
    /** The same number on WhatsApp (wa.me takes digits only, with the country code). */
    whatsappNumber: "237651575933",
    email: "contact@wazabolt.com",
    /** As on the RCCM registration form: Mile 6 Nkwen, Bamenda III, Mawa Hotel Junction, opposite Mawa Hotel. */
    address: "Mawa Hotel Junction, opposite Mawa Hotel, Mile 6 Nkwen, Bamenda III, Cameroon",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Mawa Hotel, Mile 6 Nkwen, Bamenda, Cameroon"),
  },
  /** WazaBolt's own social pages (footer, and sameAs in the structured data). */
  social: [
    { name: "Facebook", url: "https://www.facebook.com/profile.php?id=61594928852496" },
    { name: "Instagram", url: "https://www.instagram.com/wazabolt/" },
  ],
  /**
   * The legal entity behind WazaBolt, shown on the Privacy Policy and Terms
   * exactly as written on the registration documents (Meta's business
   * verification compares them). Leave null until known — never a placeholder.
   */
  legal: {
    /** Registered name, as on the taxpayer record (sole proprietorship; trade name on the RCCM certificate: WazaBolt ENTERPRISE). */
    entityName: "SYLVESTER WANKA TANIFORM (WazaBolt ENTERPRISE)" as string | null,
    /** The trade name on the RCCM certificate, shown in the site footer. */
    tradeName: "WazaBolt ENTERPRISE" as string | null,
    /** Trade register number (RCCM), Court of First Instance, Bamenda, 15 Oct 2026. */
    rccm: "RC/BDA/2026/A/000590" as string | null,
    /** Taxpayer number (NIU). */
    niu: "P068719049180K" as string | null,
    /** Where the policies were last changed (ISO date). */
    updated: "2026-11-12",
  },
  /** Emails WazaBolt itself sends (via Resend; RESEND_API_KEY in the server environment). */
  email: {
    from: "WazaBolt <noreply@wazabolt.com>",
    replyTo: "contact@wazabolt.com",
    /** Where new plan requests are announced to the WazaBolt team. */
    teamInbox: "contact@wazabolt.com",
  },
  /** Required wherever WhatsApp is named prominently. */
  trademarkNotice:
    "WazaBolt is an independent product. It is not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of its respective owner.",
} as const;

/** Nav labels are keys of `common.nav` in the dictionaries; hrefs are locale-free (localized at render). */
export type NavKey = "home" | "features" | "howItWorks" | "pricing" | "solutions" | "shops" | "restaurants" | "schools" | "faq" | "about" | "contact" | "resources" | "privacy" | "terms" | "documentTool";
export type NavItem = { key: NavKey; href: string };

export const mainNav: NavItem[] = [
  { key: "home", href: "/" },
  { key: "shops", href: "/solutions/retail" },
  { key: "restaurants", href: "/solutions/restaurants" },
  { key: "schools", href: "/schools" },
  { key: "features", href: "/features" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "pricing", href: "/pricing" },
];

export const footerNav: { key: "product" | "company" | "legal"; links: NavItem[] }[] = [
  {
    key: "product",
    links: [
      { key: "shops", href: "/solutions/retail" },
      { key: "restaurants", href: "/solutions/restaurants" },
      { key: "schools", href: "/schools" },
      { key: "features", href: "/features" },
      { key: "howItWorks", href: "/how-it-works" },
      { key: "pricing", href: "/pricing" },
      { key: "solutions", href: "/solutions" },
      { key: "documentTool", href: "/tools/documents" },
    ],
  },
  {
    key: "company",
    links: [
      { key: "about", href: "/about" },
      { key: "contact", href: "/contact" },
      { key: "resources", href: "/resources" },
      { key: "faq", href: "/faq" },
    ],
  },
  {
    key: "legal",
    links: [
      { key: "privacy", href: "/privacy" },
      { key: "terms", href: "/terms" },
    ],
  },
];
