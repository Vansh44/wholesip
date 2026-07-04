// Renders one or more JSON-LD schema.org objects as a <script> tag. Builders
// live in lib/seo/schema.ts (pure + tested); this is the only place that
// serializes them into the DOM. Passing an array emits a single script with a
// JSON array, which crawlers parse as multiple graph nodes.
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
