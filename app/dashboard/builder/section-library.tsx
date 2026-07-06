"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import {
  HOMEPAGE_SECTION_TYPES,
  SECTION_CATEGORY_LABELS,
  SECTION_TYPE_META,
  type HomepageSectionType,
  type SectionCategory,
} from "@/lib/homepage/section-types";
import { SectionThumb } from "./section-thumbs";

// The "Add section" library: a slide-over anchored to the left panel
// (Shopify-style) so the outline stays visible for context. Searchable,
// keyboard-first (↑/↓ move, Enter adds, Esc closes), with a visual
// mini-preview per block type. Plain positioned divs inside the builder's
// z-40 layer — no Dialog, no z-50 fights.

const CATEGORY_ORDER: SectionCategory[] = [
  "essentials",
  "commerce",
  "content",
  "advanced",
];

/** Case-insensitive match on label, description and keywords. Exported for tests. */
export function filterSectionTypes(query: string): HomepageSectionType[] {
  const q = query.trim().toLowerCase();
  if (!q) return HOMEPAGE_SECTION_TYPES;
  return HOMEPAGE_SECTION_TYPES.filter((t) => {
    const meta = SECTION_TYPE_META[t];
    return (
      meta.label.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q) ||
      meta.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });
}

export function SectionLibrary({
  open,
  onAdd,
  onClose,
}: {
  open: boolean;
  onAdd: (type: HomepageSectionType) => void;
  onClose: () => void;
}) {
  // Unmount when closed → every open starts with fresh search state.
  if (!open) return null;
  return <SectionLibraryPanel onAdd={onAdd} onClose={onClose} />;
}

function SectionLibraryPanel({
  onAdd,
  onClose,
}: {
  onAdd: (type: HomepageSectionType) => void;
  onClose: () => void;
}) {
  const [query, setQueryRaw] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const setQuery = (v: string) => {
    setQueryRaw(v);
    setActiveIndex(0);
  };

  const matches = useMemo(() => filterSectionTypes(query), [query]);

  // Grouped view (only when not searching — search shows a flat ranked list).
  const groups = useMemo(() => {
    if (query.trim()) return null;
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      types: matches.filter((t) => SECTION_TYPE_META[t].category === cat),
    })).filter((g) => g.types.length > 0);
  }, [matches, query]);

  // Keep the active card in view while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(".sm-builder-lib-card.is-active")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = matches[activeIndex];
      if (t) onAdd(t);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const card = (t: HomepageSectionType) => {
    const meta = SECTION_TYPE_META[t];
    const index = matches.indexOf(t);
    return (
      <button
        key={t}
        type="button"
        className={`sm-builder-lib-card ${index === activeIndex ? "is-active" : ""}`}
        onClick={() => onAdd(t)}
        onMouseEnter={() => setActiveIndex(index)}
      >
        <SectionThumb type={t} />
        <span className="sm-builder-lib-label">{meta.label}</span>
        <span className="sm-builder-lib-desc">{meta.description}</span>
      </button>
    );
  };

  return (
    <>
      <div className="sm-builder-lib-backdrop" onClick={onClose} />
      <aside
        className="sm-builder-lib"
        role="dialog"
        aria-label="Add a section"
        onKeyDown={onKeyDown}
      >
        <div className="sm-builder-lib-head">
          <div className="sm-builder-lib-search">
            <Search className="h-4 w-4" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sections…"
              aria-label="Search sections"
            />
          </div>
          <button
            type="button"
            className="sm-builder-iconbtn"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="sm-builder-lib-body" ref={listRef}>
          {matches.length === 0 ? (
            <p className="sm-builder-lib-empty">
              Nothing matches “{query.trim()}”.
            </p>
          ) : groups ? (
            groups.map((g) => (
              <div key={g.cat} className="sm-builder-lib-group">
                <p className="sm-builder-lib-grouplabel">
                  {SECTION_CATEGORY_LABELS[g.cat]}
                </p>
                <div className="sm-builder-lib-grid">{g.types.map(card)}</div>
              </div>
            ))
          ) : (
            <div className="sm-builder-lib-grid">{matches.map(card)}</div>
          )}
        </div>
      </aside>
    </>
  );
}
