import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The AI copy actions read brand/brand.md and brand/tasks/*.md at runtime via
  // fs. On serverless hosts (e.g. Vercel) a function only bundles files Next.js
  // traces, and a runtime readFile path isn't traced automatically — so force
  // the whole brand/ folder into every server trace. Harmless on Node hosts.
  outputFileTracingIncludes: {
    "/**": ["./brand/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
