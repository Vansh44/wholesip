"use client";

import dynamic from "next/dynamic";

// The TipTap editor (+ ProseMirror, BubbleMenu, slash-command) is the heaviest
// client payload on any storefront route and was shipping to every visitor of
// /blogs/write and /blogs/my-submissions. Load it on the client
// only (ssr:false — TipTap is browser-only), behind a lightweight shell. The
// (pages) stay Server Components (they export metadata), so the ssr:false dynamic
// import lives here in a Client Component as Next requires.
const WriteBlogEditor = dynamic(() => import("./write-blog-editor"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--wholesip-text-3, #8b8378)",
        fontSize: 14,
      }}
    >
      Loading editor…
    </div>
  ),
});

export default WriteBlogEditor;
