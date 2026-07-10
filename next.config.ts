import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The AI copy actions read brand/tasks/*.md at runtime via fs. On serverless
  // hosts (e.g. Vercel) a function only bundles files Next.js traces, and a
  // runtime readFile path isn't traced automatically — so force the brand task
  // prompts into every server trace. Harmless on Node hosts.
  outputFileTracingIncludes: {
    "/**": ["./brand/tasks/**"],
  },
  images: {
    // Serve modern formats — AVIF (~50% smaller than JPEG) with WebP fallback.
    // Next negotiates per request via the Accept header.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // DEV ONLY: on DNS64/NAT64 networks (common on Indian ISPs) public hosts
    // resolve to 64:ff9b::/96 addresses, which Next 16's image-optimizer SSRF
    // guard classifies as private and blocks — every remote (Supabase) image
    // 400s locally. Relax the check in development only; production keeps the
    // full SSRF protection.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
  experimental: {
    // Tree-shake barrel imports to per-export modules. lucide-react is already
    // optimized by default; these heavy ones are not. (They're also lazily
    // loaded via next/dynamic, so this trims what lands in their split chunks.)
    optimizePackageImports: [
      "recharts",
      "@tiptap/react",
      "@tiptap/starter-kit",
    ],
  },
};

export default nextConfig;
