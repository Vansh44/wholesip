"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Collapsible disclosure group for inspector forms — long per-section forms
// (hero, tile grid, FAQ…) fold into scannable chunks. Pure wrapper: the
// fields inside are unchanged and keep writing through to the draft.
export function FieldGroup({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`sm-builder-fieldgroup ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="sm-builder-fieldgroup-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown className="sm-builder-fieldgroup-chevron h-4 w-4" />
      </button>
      {open && <div className="sm-builder-fieldgroup-body">{children}</div>}
    </section>
  );
}
