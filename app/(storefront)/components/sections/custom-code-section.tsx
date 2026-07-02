import type { CustomCodeConfig } from "@/lib/homepage/section-types";
import { CustomCodeFrame } from "./custom-code-frame";

// Storefront wrapper for a merchant custom-code section — the sandboxing
// itself lives in CustomCodeFrame (shared with the builder's live preview).
export function CustomCodeSection({ config }: { config: CustomCodeConfig }) {
  if (!config.html.trim() && !config.css.trim() && !config.js.trim()) {
    return null;
  }
  return (
    <section className="home-section home-custom-code">
      <CustomCodeFrame config={config} />
    </section>
  );
}
