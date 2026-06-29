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
