import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Routes renamed in the WazaBolt rebrand — keep old links working.
  async redirects() {
    return [
      { source: "/industries", destination: "/solutions", permanent: true },
      { source: "/how-it-works", destination: "/product", permanent: true },
    ];
  },
};

export default nextConfig;
