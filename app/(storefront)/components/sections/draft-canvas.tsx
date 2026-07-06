"use client";

import { useEffect, useMemo, useState } from "react";
import type { PageSectionItem } from "@/lib/sections/registry";
import { mapSectionData, type SectionDatasets } from "@/lib/sections/map-data";
import { PageSectionRenderer } from "./page-section-renderer";

// Builder preview canvas: renders the draft sections CLIENT-side so edits in
// the builder paint instantly. The parent builder posts the latest draft via
// `sm-draft` on every mutation (autosave still runs in the background); the
// RSC render remains the source of truth for the initial load and publish.
// Data-driven sections re-resolve locally from the dataset snapshots the
// server passed down, using the same pure mapper as the real page — the
// preview can never drift from published rendering logic.
export function DraftCanvas({
  initialSections,
  datasets,
}: {
  initialSections: PageSectionItem[];
  datasets: SectionDatasets;
}) {
  const [sections, setSections] = useState(initialSections);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Same-origin only (dashboard + storefront share the host).
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; sections?: unknown };
      if (data?.type === "sm-draft" && Array.isArray(data.sections)) {
        setSections(data.sections as PageSectionItem[]);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const resolved = useMemo(
    () => mapSectionData(sections, datasets),
    [sections, datasets],
  );

  return <PageSectionRenderer sections={sections} resolved={resolved} />;
}
