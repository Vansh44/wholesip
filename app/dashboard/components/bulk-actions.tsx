"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Header "select all" checkbox — reflects an indeterminate state when only some
// visible rows are selected (set imperatively; HTML has no indeterminate attr).
export function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  label = "Select all rows",
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="dash-checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
    />
  );
}

// Per-row checkbox. Stops propagation so clicking it never triggers a row's
// own onClick (several tables navigate on row click).
export function RowCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <input
      type="checkbox"
      className="dash-checkbox"
      checked={checked}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      aria-label={label ?? "Select row"}
    />
  );
}

// Floating action bar shown while a selection is active. The caller supplies the
// action buttons as children (entity-specific); this owns the count + clear.
export function BulkActionBar({
  count,
  onClear,
  children,
  busy = false,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="dash-bulk-bar" role="region" aria-label="Bulk actions">
      <span className="dash-bulk-count">{count} selected</span>
      <div className="dash-bulk-divider" aria-hidden />
      <div className="dash-bulk-actions" aria-busy={busy}>
        {children}
      </div>
      <button
        type="button"
        className="dash-bulk-clear"
        onClick={onClear}
        disabled={busy}
      >
        Clear
      </button>
    </div>
  );
}
