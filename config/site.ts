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
  /** Required wherever WhatsApp is named prominently. */
  trademarkNotice:
    "WazaBolt is an independent product. It is not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of its respective owner.",
} as const;

export type NavItem = { label: string; href: string };

export const mainNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Solutions", href: "/solutions" },
  { label: "FAQ", href: "/faq" },
];

export const footerNav: { title: string; links: NavItem[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Solutions", href: "/solutions" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Resources", href: "/resources" },
      { label: "FAQ", href: "/faq" },
      { label: "Brand kit", href: "/brand" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];
