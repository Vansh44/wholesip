"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";

export type CodeLanguage = "html" | "css" | "javascript";

// The actual CodeMirror 6 editor. CodeMirror + language packs are a heavy,
// browser-only payload, so this module is only ever imported through
// code-editor-lazy.tsx (dynamic, ssr:false) — never directly.
export default function CodeEditor({
  language,
  value,
  onChange,
  placeholder,
  minHeight = "120px",
}: {
  language: CodeLanguage;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  const extensions = useMemo<Extension[]>(() => {
    switch (language) {
      case "html":
        return [html()];
      case "css":
        return [css()];
      case "javascript":
        return [javascript()];
    }
  }, [language]);

  return (
    <div className="border-input focus-within:border-primary overflow-hidden rounded-md border text-xs">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        placeholder={placeholder}
        minHeight={minHeight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
      />
    </div>
  );
}
