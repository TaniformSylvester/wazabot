import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { siteConfig } from "@/config/site";
import { brandHex } from "@/lib/brand/mark-svg";
import { LOCALES } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { alternatesFor, socialFor } from "@/lib/i18n/metadata";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// Only /en/… and /fr/… exist; anything else is a 404.
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return {
    metadataBase: new URL(siteConfig.url),
    applicationName: siteConfig.name,
    title: {
      default: t.meta.siteTitle,
      template: `%s | ${siteConfig.name}`,
    },
    description: t.meta.siteDescription,
    keywords: t.meta.keywords,
    alternates: alternatesFor(locale, "/"),
    ...socialFor(locale, t, { title: t.meta.siteTitle, description: t.meta.siteDescription, path: "/" }),
    // Search Console ownership (Settings → Ownership verification → HTML tag): the token only, set in Vercel.
    ...(process.env.GOOGLE_SITE_VERIFICATION || process.env.BING_SITE_VERIFICATION
      ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined } }
      : {}),
  };
}

export const viewport: Viewport = {
  themeColor: brandHex.cream,
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale} messages={{ common: t.common, auth: t.auth }}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
