"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string;
};

function displayName(c: CustomerOption): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (c.email) return c.email.split("@")[0];
  return "Customer";
}

function initials(c: CustomerOption): string {
  return (
    displayName(c)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

type Props = {
  customers: CustomerOption[];
  /** Currently selected customer ids. */
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Select / clear all currently visible (filtered) rows. */
  onSetMany?: (ids: string[], checked: boolean) => void;
  /** When true, only customers with an email are shown (e.g. email targeting). */
  emailOnly?: boolean;
  /** Optional max height for the scroll area. */
  maxHeightClass?: string;
};

export function CustomerMultiselect({
  customers,
  selected,
  onToggle,
  onSetMany,
  emailOnly = false,
  maxHeightClass = "max-h-[320px]",
}: Props) {
  const [search, setSearch] = useState("");

  const pool = useMemo(
    () => (emailOnly ? customers.filter((c) => c.email) : customers),
    [customers, emailOnly],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((c) => {
      return (
        displayName(c).toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    });
  }, [pool, search]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  return (
    <div className="rounded-md border border-[#e5e7eb]">
      <div className="flex items-center gap-2 border-b border-[#f0f0f0] px-3 py-2">
        <Search className="h-4 w-4 shrink-0 opacity-50" />
        <input
          type="text"
          className="w-full bg-transparent text-sm outline-none placeholder:text-[#9ca3af]"
          placeholder="Search name, email or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {onSetMany && filtered.length > 0 && (
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-[#4f46e5] hover:underline"
            onClick={() =>
              onSetMany(
                filtered.map((c) => c.id),
                !allVisibleSelected,
              )
            }
          >
            {allVisibleSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      <div className={`${maxHeightClass} overflow-y-auto`}>
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-[#9ca3af]">
            {emailOnly && pool.length === 0
              ? "No customers have an email on file."
              : "No customers match your search."}
          </p>
        ) : (
          <ul>
            {filtered.map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[#f9fafb]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#4f46e5]"
                      checked={checked}
                      onChange={() => onToggle(c.id)}
                    />
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: "var(--dash-accent, #4f46e5)" }}
                    >
                      {initials(c)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[#1f2937]">
                        {displayName(c)}
                      </span>
                      <span className="block truncate text-xs text-[#9ca3af]">
                        {c.email ?? c.phone ?? "—"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
