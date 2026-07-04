import { sanitizeBlogContent } from "@/lib/sanitize";
import type {
  RichTextConfig,
  SectionStyle,
} from "@/lib/homepage/section-types";
import { SectionShell } from "./section-shell";

// Inline (SEO-crawlable) rich text. The HTML is sanitized at save time in the
// actions AND here at the render boundary — defense in depth, same trust model
// as blog content (never trust stored HTML).
export function RichTextSection({
  sectionId,
  style,
  config,
}: {
  sectionId: string;
  style?: SectionStyle;
  config: RichTextConfig;
}) {
  const html = sanitizeBlogContent(config.html);
  if (!html.trim()) return null;
  return (
    <SectionShell
      sectionId={sectionId}
      style={style}
      className={`home-rich-text${config.width === "full" ? " is-full" : ""}`}
    >
      <div
        className="home-rich-text-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </SectionShell>
  );
}
