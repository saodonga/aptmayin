import type { NextConfig } from "next";

// Using 'any' type here because the Next.js 16 type definitions for NextConfig
// are missing the standard 'eslint' option, which is still respected at build time.
const nextConfig: any = {
  output: "standalone",
  serverExternalPackages: ["ipp"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig as NextConfig;

