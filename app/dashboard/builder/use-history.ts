"use client";

import { useCallback, useRef, useState } from "react";
import type { PageSectionItem } from "@/lib/sections/registry";

// ---------------------------------------------------------------------------
// Builder undo/redo. Classic snapshot model: `record` pushes the PRE-mutation
// state before every sections change; undo/redo swap the current state with
// the top of the opposite stack. Sections arrays are treated immutably
// throughout the builder (map/filter/arrayMove), so snapshots are cheap
// reference copies — no cloning.
//
// Typing bursts coalesce: consecutive `record`s with the same coalesceKey
// within COALESCE_MS keep only the first (pre-burst) snapshot, so one Cmd+Z
// undoes the whole burst — Framer-style. Structural ops pass no key and
// always snapshot.
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  sections: PageSectionItem[];
  selectedSectionId: string | null;
}

export const HISTORY_CAPACITY = 50;
export const HISTORY_COALESCE_MS = 800;

export function useHistory() {
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const lastAtRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  /** Push the pre-mutation state. Call BEFORE applying a mutation. */
  const record = useCallback(
    (entry: HistoryEntry, coalesceKey?: string) => {
      const now = Date.now();
      const coalesce =
        coalesceKey != null &&
        coalesceKey === lastKeyRef.current &&
        now - lastAtRef.current < HISTORY_COALESCE_MS;
      lastKeyRef.current = coalesceKey ?? null;
      lastAtRef.current = now;
      // Any new mutation invalidates the redo branch.
      redoStack.current = [];
      if (!coalesce) {
        undoStack.current.push(entry);
        if (undoStack.current.length > HISTORY_CAPACITY)
          undoStack.current.shift();
      }
      sync();
    },
    [sync],
  );

  /** Swap: current state goes to redo, returns the state to restore. */
  const undo = useCallback(
    (current: HistoryEntry): HistoryEntry | null => {
      const prev = undoStack.current.pop();
      if (!prev) return null;
      redoStack.current.push(current);
      lastKeyRef.current = null; // an undo ends any typing burst
      sync();
      return prev;
    },
    [sync],
  );

  const redo = useCallback(
    (current: HistoryEntry): HistoryEntry | null => {
      const next = redoStack.current.pop();
      if (!next) return null;
      undoStack.current.push(current);
      lastKeyRef.current = null;
      sync();
      return next;
    },
    [sync],
  );

  /** Clear everything — call when a different page loads. */
  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastKeyRef.current = null;
    sync();
  }, [sync]);

  return { record, undo, redo, reset, canUndo, canRedo };
}
