"use client";

import { useMemo, useState } from "react";
import { Plus, Minus } from "lucide-react";
import type {
  FaqAccordionConfig,
  SectionStyle,
} from "@/lib/homepage/section-types";
import { SectionShell } from "./section-shell";

// FAQ accordion — expandable Q/A list with an optional category filter pill
// row. Answers are plain text (never HTML). Theme-agnostic; styled with the
// storefront tokens so it reskins per theme.
export function FaqAccordionSection({
  sectionId,
  style,
  config,
}: {
  sectionId: string;
  style?: SectionStyle;
  config: FaqAccordionConfig;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Distinct categories in item order, used for the filter pills.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const it of config.items) {
      const c = it.category.trim();
      if (c && !seen.includes(c)) seen.push(c);
    }
    return seen;
  }, [config.items]);

  const showFilters = config.show_filters && categories.length > 0;

  const visible = config.items.filter(
    (it) => activeFilter === "all" || it.category.trim() === activeFilter,
  );

  if (config.items.length === 0) return null;

  return (
    <SectionShell sectionId={sectionId} style={style}>
      {(config.heading || config.subheading) && (
        <div className="home-section-head">
          {config.heading && (
            <h2 className="home-section-title">{config.heading}</h2>
          )}
          {config.subheading && (
            <p className="home-section-sub">{config.subheading}</p>
          )}
        </div>
      )}

      {showFilters && (
        <div className="home-faq-filters">
          <button
            type="button"
            className={`home-faq-pill${activeFilter === "all" ? " active" : ""}`}
            onClick={() => {
              setActiveFilter("all");
              setOpenIndex(0);
            }}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`home-faq-pill${activeFilter === c ? " active" : ""}`}
              onClick={() => {
                setActiveFilter(c);
                setOpenIndex(0);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="home-faq-list">
        {visible.map((item, i) => {
          const open = openIndex === i;
          return (
            <div className={`home-faq-item${open ? " open" : ""}`} key={i}>
              <button
                type="button"
                className="home-faq-q"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
              >
                <span>{item.question}</span>
                {open ? (
                  <Minus size={20} aria-hidden />
                ) : (
                  <Plus size={20} aria-hidden />
                )}
              </button>
              {open && item.answer && (
                <p className="home-faq-a">{item.answer}</p>
              )}
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
