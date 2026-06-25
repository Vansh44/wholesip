"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Premium horizontal carousel for the blog row: prev/next arrows that fade out
// at the ends, mouse drag-to-scroll, and native trackpad/touch swipe. The
// server component renders the cards and passes them in as children, so this
// stays a thin interaction layer.
export function BlogCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Recompute which arrows are active from the live scroll position.
  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setCanPrev(scrollLeft > 1);
    setCanNext(scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync(); // initial state once mounted
    el.addEventListener("scroll", sync, { passive: true });
    // Re-evaluate when the track or its contents resize (responsive widths,
    // font load, etc.).
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync]);

  const scrollByPage = useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // Advance by ~one viewport, snapped to whole cards.
    const amount = Math.max(el.clientWidth * 0.85, 280);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }, []);

  // --- Mouse drag-to-scroll (mouse only; touch/trackpad use native scroll) ---
  const drag = useRef({
    active: false,
    startX: 0,
    startScroll: 0,
    moved: false,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
    setDragging(true);
    el.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    trackRef.current?.releasePointerCapture?.(e.pointerId);
  };

  // Swallow the click that follows a drag so dragging doesn't open a post.
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div className="home-blog-carousel">
      <button
        type="button"
        className="home-blog-arrow home-blog-arrow-prev"
        aria-label="Previous posts"
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
      >
        <ArrowIcon dir="left" />
      </button>

      <div
        ref={trackRef}
        className={`home-blog-scroll${dragging ? " is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>

      <button
        type="button"
        className="home-blog-arrow home-blog-arrow-next"
        aria-label="Next posts"
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
      >
        <ArrowIcon dir="right" />
      </button>
    </div>
  );
}

function ArrowIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}
