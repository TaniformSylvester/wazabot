import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The root layout lives under /[lang], so unmatched URLs need a standalone 404.
    globalNotFound: true,
  },
  // Routes renamed in the WazaBolt rebrand — keep old links working (proxy.ts adds the locale).
  async redirects() {
    return [
      { source: "/industries", destination: "/solutions", permanent: true },
      { source: "/product", destination: "/how-it-works", permanent: true },
      { source: "/:lang(en|fr)/industries", destination: "/:lang/solutions", permanent: true },
      { source: "/:lang(en|fr)/product", destination: "/:lang/how-it-works", permanent: true },
    ];
  },
};

export default nextConfig;
