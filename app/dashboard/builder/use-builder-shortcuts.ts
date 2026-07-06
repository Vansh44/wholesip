"use client";

import { useEffect, useRef } from "react";

// Global keyboard shortcuts for the builder. One window-level listener; the
// handlers object is read through a ref so callers can pass fresh closures
// every render without re-subscribing.
//
// Interception rules:
//  • CodeMirror (.cm-editor) and TipTap (.ProseMirror) own ALL their keys —
//    they have their own undo history.
//  • Inside other editable fields only Cmd/Ctrl+Z/Y/S are intercepted
//    (app-level undo, Framer-style); everything else stays native.
//  • While any dialog is open (`suspended`), all shortcuts are off — dialogs
//    handle their own Esc/typing.
export function useBuilderShortcuts({
  suspended,
  handlers,
}: {
  suspended: boolean;
  handlers: {
    undo: () => void;
    redo: () => void;
    save: () => void;
    escape: () => void;
    moveSelection: (dir: 1 | -1) => void;
    duplicate: () => void;
    requestDelete: () => void;
  };
}) {
  const handlersRef = useRef(handlers);
  const suspendedRef = useRef(suspended);
  useEffect(() => {
    handlersRef.current = handlers;
    suspendedRef.current = suspended;
  });

  useEffect(() => {
    function editableKind(t: EventTarget | null): "rich" | "field" | "none" {
      const el = t instanceof HTMLElement ? t : null;
      if (!el) return "none";
      if (el.closest(".cm-editor, .ProseMirror")) return "rich";
      const tag = el.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      )
        return "field";
      return "none";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (suspendedRef.current) return;
      const kind = editableKind(e.target);
      if (kind === "rich") return;
      const h = handlersRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) h.redo();
        else h.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        h.redo();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        h.save();
        return;
      }
      if (kind === "field") return;

      if (e.key === "Escape") {
        h.escape();
        return;
      }
      if (e.key === "ArrowDown" && !mod) {
        e.preventDefault();
        h.moveSelection(1);
        return;
      }
      if (e.key === "ArrowUp" && !mod) {
        e.preventDefault();
        h.moveSelection(-1);
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        h.duplicate();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        h.requestDelete();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
