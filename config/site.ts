/**
 * Brand constants. The English copy here is used where no locale applies
 * (web manifest, generated social images); pages use the dictionaries in
 * messages/ instead.
 */
export const siteConfig = {
  name: "WazaBolt",
  /** Brand descriptor — used under the logo and in social profiles. */
  tagline: "Your AI Business Assistant on WhatsApp.",
  /** Primary marketing message (hero, CTAs, social). */
  headline: "Power your business on WhatsApp.",
  /** Supporting message. */
  supporting: "Never miss a customer.",
  positioning: "WhatsApp Business Automation for Africa",
  title: "WazaBolt — WhatsApp Business Automation for Africa",
  description:
    "WazaBolt is your AI business assistant on WhatsApp. It answers customer questions, shares products and prices, captures orders and hands conversations to your team when needed.",
  /** Set NEXT_PUBLIC_SITE_URL per environment — never hard-code the deployment URL. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** How to reach the WazaBolt team (Contact page). Shown as written — not translated. */
  contact: {
    phone: "+237 651 575 933",
    phoneHref: "tel:+237651575933",
    /** The same number on WhatsApp (wa.me takes digits only, with the country code). */
    whatsappNumber: "237651575933",
    email: "contact@wazabolt.com",
    address: "Mile Six Nkwen, Bamenda, Behind Mawa Hotel, Cameroon",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Mawa Hotel, Mile Six Nkwen, Bamenda, Cameroon"),
  },
  /** Required wherever WhatsApp is named prominently. */
  trademarkNotice:
    "WazaBolt is an independent product. It is not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of its respective owner.",
} as const;

/** Nav labels are keys of `common.nav` in the dictionaries; hrefs are locale-free (localized at render). */
export type NavKey = "home" | "features" | "howItWorks" | "pricing" | "solutions" | "faq" | "about" | "contact" | "resources" | "privacy" | "terms";
export type NavItem = { key: NavKey; href: string };

export const mainNav: NavItem[] = [
  { key: "home", href: "/" },
  { key: "features", href: "/features" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "pricing", href: "/pricing" },
  { key: "solutions", href: "/solutions" },
  { key: "faq", href: "/faq" },
];

export const footerNav: { key: "product" | "company" | "legal"; links: NavItem[] }[] = [
  {
    key: "product",
    links: [
      { key: "features", href: "/features" },
      { key: "howItWorks", href: "/how-it-works" },
      { key: "pricing", href: "/pricing" },
      { key: "solutions", href: "/solutions" },
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
