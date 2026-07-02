"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mounted only in builder preview mode (homepage `/?preview=1` and custom
// pages `/[slug]?preview=1`). Listens for a refresh ping from the builder
// (same-origin parent window) and re-runs the server component so the iframe
// reflects the just-saved draft — no full reload, scroll preserved.
export function PreviewBridge() {
  const router = useRouter();
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Same-origin only (dashboard + storefront share the host), and only our
      // marker. The builder posts with targetOrigin = its own origin.
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type === "sm-preview-refresh") {
        router.refresh();
      }
    }
    window.addEventListener("message", onMessage);
    // Tell the parent we're mounted and ready (so it can stop the fallback timer).
    window.parent?.postMessage(
      { type: "sm-preview-ready" },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}

// A small fixed banner making it obvious this is an unpublished preview.
export function PreviewBadge() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483647,
        background: "#17130f",
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        padding: "7px 14px",
        borderRadius: 999,
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        pointerEvents: "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      Draft preview — not published
    </div>
  );
}
