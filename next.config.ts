import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The root layout lives under /[lang], so unmatched URLs need a standalone 404.
    globalNotFound: true,
    // Product photos are uploaded through a Server Action (max 4 MB each; Vercel caps request bodies at 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
    // Styles in the page itself: on weak connections the first text shows one round trip sooner (no separate CSS file to wait for).
    inlineCss: true,
  },
  // PDF documents (lib/documents/pdf) read their font files at run time.
  outputFileTracingIncludes: {
    "/api/documents/*": ["./assets/fonts/**"],
    "/\\[lang\\]/dashboard/documents/**": ["./assets/fonts/**"],
    // Customer statements (PDF route and "Send on WhatsApp").
    "/\\[lang\\]/dashboard/customers/**": ["./assets/fonts/**"],
    // School report cards (PDF route and "Send to parent").
    "/\\[lang\\]/dashboard/school/**": ["./assets/fonts/**"],
    // The shop's WhatsApp Status image (app/s/[slug]/status.png).
    "/s/**": ["./assets/fonts/**"],
  },
  // Routes renamed in the WazaBolt rebrand — keep old links working (proxy.ts adds the locale).
  async redirects() {
    return [
      { source: "/industries", destination: "/solutions", permanent: true },
      { source: "/product", destination: "/how-it-works", permanent: true },
      { source: "/:lang(en|fr)/industries", destination: "/:lang/solutions", permanent: true },
      { source: "/:lang(en|fr)/product", destination: "/:lang/how-it-works", permanent: true },
      // Schools have their own front door: WazaBolt Schools.
      { source: "/solutions/schools", destination: "/schools", permanent: true },
      { source: "/:lang(en|fr)/solutions/schools", destination: "/:lang/schools", permanent: true },
      // The brand kit is an internal design reference, not a public page.
      { source: "/brand", destination: "/", permanent: true },
      { source: "/:lang(en|fr)/brand", destination: "/:lang", permanent: true },
      // Languages & AI style moved under AI Assistant.
      { source: "/:lang(en|fr)/dashboard/settings/languages", destination: "/:lang/dashboard/ai/languages", permanent: true },
    ];
  },
};

export default nextConfig;
