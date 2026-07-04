import type {
  CustomCodeConfig,
  SectionStyle,
} from "@/lib/homepage/section-types";
import { CustomCodeFrame } from "./custom-code-frame";
import { SectionShell } from "./section-shell";

// Storefront wrapper for a merchant custom-code section — the sandboxing
// itself lives in CustomCodeFrame (shared with the builder's live preview).
export function CustomCodeSection({
  sectionId,
  style,
  config,
}: {
  sectionId: string;
  style?: SectionStyle;
  config: CustomCodeConfig;
}) {
  if (!config.html.trim() && !config.css.trim() && !config.js.trim()) {
    return null;
  }
  return (
    <SectionShell
      sectionId={sectionId}
      style={style}
      className="home-custom-code"
    >
      <CustomCodeFrame config={config} />
    </SectionShell>
  );
}
