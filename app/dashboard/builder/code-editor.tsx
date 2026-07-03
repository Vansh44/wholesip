"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";

export type CodeLanguage = "html" | "css" | "javascript";

// A comfortable, monospaced code font — this is a real editor, not a cramped
// one-line input.
const editorTheme = EditorView.theme({
  "&": { fontSize: "13px" },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    lineHeight: "1.55",
  },
  ".cm-content": { padding: "8px 0" },
  ".cm-gutters": { userSelect: "none" },
});

// The actual CodeMirror 6 editor. CodeMirror + language packs are a heavy,
// browser-only payload, so this module is only ever imported through
// code-editor-lazy.tsx (dynamic, ssr:false) — never directly.
export default function CodeEditor({
  language,
  value,
  onChange,
  placeholder,
  minHeight = "220px",
  maxHeight = "60vh",
}: {
  language: CodeLanguage;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Starting height of the (vertically resizable) editor. */
  minHeight?: string;
  /** Cap before the editor scrolls internally instead of growing the dialog. */
  maxHeight?: string;
}) {
  const extensions = useMemo<Extension[]>(() => {
    const lang =
      language === "html" ? html() : language === "css" ? css() : javascript();
    return [
      lang,
      // Long lines wrap instead of clipping off the right edge — the single
      // biggest fix for authoring real markup/CSS/JS in here.
      EditorView.lineWrapping,
      // Tab indents inside the editor instead of moving focus away.
      keymap.of([indentWithTab]),
      editorTheme,
    ];
  }, [language]);

  return (
    // Vertically resizable: drag the bottom edge to make the editor as tall as
    // you need. Starts at `minHeight`, scrolls internally past `maxHeight`.
    <div
      className="border-input focus-within:border-primary resize-y overflow-hidden rounded-md border"
      style={{ height: minHeight, minHeight: "80px" }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        placeholder={placeholder}
        height="100%"
        maxHeight={maxHeight}
        style={{ height: "100%" }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
        }}
      />
    </div>
  );
}
