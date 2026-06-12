import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Scope to the code we actually unit-test. Excludes Supabase SDK
      // wrappers, email templates, and Next.js route/component files, which
      // are covered by integration/e2e flows rather than vitest.
      include: [
        "lib/utils.ts",
        "lib/slug.ts",
        "lib/pricing.ts",
        "lib/sanitize.ts",
        "lib/og-image.ts",
        "lib/blog-config.ts",
        "lib/supabase/storage-cleanup.ts",
        "app/actions/**/*.ts",
        "app/dashboard/lib/permissions.ts",
      ],
      exclude: ["**/*.test.ts", "**/_test-helpers.ts"],
    },
  },
});
