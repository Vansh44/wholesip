import type { PageSectionItem } from "@/lib/sections/registry";
import {
  HomepageSectionRenderer,
  type ResolvedData,
} from "../homepage/homepage-section-renderer";

// Renders a store page's sections array (store_pages.sections /
// published_sections) with the same renderer + resolved-data machinery the
// homepage uses. Disabled sections are skipped here so callers can pass the
// stored array as-is.
export function PageSectionRenderer({
  sections,
  resolved,
}: {
  sections: PageSectionItem[];
  resolved: ResolvedData;
}) {
  const visible = sections.filter((s) => s.enabled);
  if (visible.length === 0) return null;
  return (
    <div className="home-sections">
      {visible.map((s) => (
        <HomepageSectionRenderer key={s.id} section={s} resolved={resolved} />
      ))}
    </div>
  );
}
