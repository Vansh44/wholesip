"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Click-to-edit canvas overlay — mounted ONLY in builder preview mode
// (?preview=1, alongside PreviewBridge). Live pages never import this.
//
// Approach: a measured HIT-LAYER, not event delegation. The custom_code
// sections are sandboxed iframes that swallow every click, so listening on
// `document` can never catch them; instead we measure each [data-section-id]
// rect and float a transparent, clickable rect above it (plus "+ Add section"
// buttons at the boundaries). Wheel events pass through hit rects (default
// wheel scrolling targets the scrollable ancestor), so the page still scrolls.
//
// Re-scan triggers: mount, MutationObserver on <body> (rAF-debounced — this is
// what survives router.refresh(): the RSC merge replaces section DOM but not
// this client component's own layer), window resize, and a ResizeObserver per
// section (custom_code iframes auto-grow after their postMessage height).
//
// postMessage protocol (all same-origin, extends PreviewBridge's):
//   iframe → builder: sm-select {id} · sm-hover {id|null} ·
//                     sm-add-at {afterId|null} · sm-visible {ids[]}
//   builder → iframe: sm-highlight {id|null} · sm-scroll-to {id}
// ---------------------------------------------------------------------------

interface Rect {
  id: string;
  label: string;
  top: number;
  height: number;
}

const post = (msg: Record<string, unknown>) =>
  window.parent?.postMessage(msg, window.location.origin);

export function BuilderOverlay() {
  const [rects, setRects] = useState<Rect[]>([]);
  const [docHeight, setDocHeight] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [remoteHighlightId, setRemoteHighlightId] = useState<string | null>(
    null,
  );
  const rafRef = useRef<number | null>(null);
  const lastVisibleRef = useRef<string>("");

  // --- measure ---------------------------------------------------------------
  useEffect(() => {
    const sectionResizeObserver = new ResizeObserver(() => scheduleScan());

    function scan() {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>("[data-section-id]"),
      );
      const next: Rect[] = els.map((el) => {
        sectionResizeObserver.observe(el);
        const r = el.getBoundingClientRect();
        return {
          id: el.dataset.sectionId as string,
          label: labelFor(el),
          top: r.top + window.scrollY,
          height: r.height,
        };
      });
      setRects(next);
      setDocHeight(document.documentElement.scrollHeight);

      // Tell the builder which sections actually rendered (empty ones return
      // null and have no DOM node) — the outline badges the missing ones.
      const visible = next.map((r) => r.id).join(",");
      if (visible !== lastVisibleRef.current) {
        lastVisibleRef.current = visible;
        post({ type: "sm-visible", ids: next.map((r) => r.id) });
      }
    }

    function scheduleScan() {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        scan();
      });
    }

    scan();
    const mutationObserver = new MutationObserver(scheduleScan);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleScan);

    return () => {
      mutationObserver.disconnect();
      sectionResizeObserver.disconnect();
      window.removeEventListener("resize", scheduleScan);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // --- builder → iframe messages ----------------------------------------------
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; id?: string | null };
      if (data?.type === "sm-highlight") {
        setRemoteHighlightId(data.id ?? null);
      } else if (data?.type === "sm-scroll-to" && data.id) {
        document
          .querySelector(`[data-section-id="${CSS.escape(data.id)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const activeId = hoverId ?? remoteHighlightId;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: Math.max(docHeight, ...rects.map((r) => r.top + r.height)),
        pointerEvents: "none",
        zIndex: 2147483000,
      }}
    >
      {rects.map((r, i) => (
        <div key={r.id}>
          {/* Transparent hit rect: hover outline + click-to-select. */}
          <div
            onMouseEnter={() => {
              setHoverId(r.id);
              post({ type: "sm-hover", id: r.id });
            }}
            onMouseLeave={() => {
              setHoverId(null);
              post({ type: "sm-hover", id: null });
            }}
            onClick={() => post({ type: "sm-select", id: r.id })}
            style={{
              position: "absolute",
              top: r.top,
              left: 0,
              right: 0,
              height: r.height,
              pointerEvents: "auto",
              cursor: "pointer",
              outline:
                activeId === r.id
                  ? "2px solid #4f39f6"
                  : "2px solid transparent",
              outlineOffset: -2,
              background:
                activeId === r.id ? "rgba(79, 57, 246, 0.05)" : "transparent",
              transition: "outline-color 0.12s, background 0.12s",
            }}
          >
            {activeId === r.id && (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  left: 6,
                  background: "#4f39f6",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "system-ui, sans-serif",
                  padding: "3px 9px",
                  borderRadius: 6,
                  pointerEvents: "none",
                }}
              >
                {r.label}
              </span>
            )}
          </div>

          {/* "+ Add section" at the top boundary of the first section and
              below every section. afterId (not index): the DOM only contains
              VISIBLE sections, so the builder maps ids to draft positions. */}
          {i === 0 && <AddButton top={r.top} afterId={null} first />}
          <AddButton top={r.top + r.height} afterId={r.id} />
        </div>
      ))}
    </div>
  );
}

function AddButton({
  top,
  afterId,
  first = false,
}: {
  top: number;
  afterId: string | null;
  first?: boolean;
}) {
  return (
    <button
      onClick={() => post({ type: "sm-add-at", afterId })}
      title="Add a section here"
      style={{
        position: "absolute",
        top: top - 13,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: "#fff",
        color: "#4f39f6",
        border: "1px solid #c4bcff",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "system-ui, sans-serif",
        padding: "4px 12px",
        boxShadow: "0 4px 14px rgba(16, 24, 40, 0.18)",
        cursor: "pointer",
        opacity: 0.92,
        marginTop: first ? 13 : 0,
      }}
    >
      + Add section
    </button>
  );
}

// Human label for the outline chip — derived from the type class the
// SectionShell renders, without importing the whole registry client-side.
function labelFor(el: HTMLElement): string {
  if (el.classList.contains("home-custom-code")) return "Custom Code";
  if (el.classList.contains("home-rich-text")) return "Rich Text";
  if (el.querySelector(".home-banner")) return "Promo Banner";
  if (el.querySelector(".home-product-grid")) return "Featured Products";
  if (el.querySelector(".home-cat-grid, .home-cat-scroll"))
    return "Shop by Category";
  if (el.querySelector(".home-blog-grid, .home-blog-carousel"))
    return "Blog Posts";
  return "Section";
}
