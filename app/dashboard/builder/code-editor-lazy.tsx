"use client";

import dynamic from "next/dynamic";
import type { CodeLanguage } from "./code-editor";

// CodeMirror 6 (editor core + html/css/js language packs) is a large,
// browser-only bundle. Load it on the client only (ssr:false), behind a
// lightweight textarea-shaped shell, exactly like the TipTap editor
// (write-blog-editor-lazy.tsx). The builder is already a Client Component, so
// the ssr:false dynamic import is allowed here.
const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => (
    <div className="border-input bg-background text-muted-foreground flex min-h-[120px] items-center justify-center rounded-md border font-mono text-xs">
      Loading editor…
    </div>
  ),
});

export type { CodeLanguage };
export default CodeEditor;
