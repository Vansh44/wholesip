"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

export type DateRange = { from: string; to: string }; // "YYYY-MM-DD" | ""

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function prettyShort(s: string): string {
  return parseYmd(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Single smart date filter. First pick selects one day (a single-date filter);
 * a second pick (on/after the first) completes a range. Picking again starts
 * over. Emits { from, to } where `to` is "" for a single-date selection.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [view, setView] = useState(() => {
    const base = value.from ? parseYmd(value.from) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) list.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      list.push(ymd(new Date(year, month, day)));
    }
    return list;
  }, [view]);

  const todayKey = ymd(new Date());

  const handlePick = (key: string) => {
    // No selection yet, or a complete range exists → start a fresh single pick.
    if (!value.from || value.to) {
      onChange({ from: key, to: "" });
      return;
    }
    // One date chosen: a later date completes the range; same/earlier restarts.
    if (key > value.from) onChange({ from: value.from, to: key });
    else onChange({ from: key, to: "" });
  };

  const label = !value.from
    ? "Any date"
    : value.to
      ? `${prettyShort(value.from)} – ${prettyShort(value.to)}`
      : prettyShort(value.from);

  return (
    <div className="enquiries-datepicker" ref={ref}>
      <button
        type="button"
        className={`enquiries-datepicker-trigger${value.from ? " has-value" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Calendar className="h-4 w-4" />
        <span>{label}</span>
        {value.from && (
          <span
            role="button"
            aria-label="Clear date filter"
            className="enquiries-datepicker-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: "", to: "" });
            }}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div
          className="enquiries-calendar"
          role="dialog"
          aria-label="Pick a date or range"
        >
          <div className="enquiries-calendar-head">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <strong>
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="enquiries-calendar-weekdays">
            {WEEKDAYS.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>

          <div className="enquiries-calendar-grid">
            {cells.map((key, i) =>
              key === null ? (
                <span key={`b${i}`} />
              ) : (
                <button
                  key={key}
                  type="button"
                  className={[
                    "enquiries-calendar-day",
                    key === value.from || key === value.to ? "selected" : "",
                    value.to && key > value.from && key < value.to
                      ? "in-range"
                      : "",
                    key === todayKey ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handlePick(key)}
                >
                  {parseYmd(key).getDate()}
                </button>
              ),
            )}
          </div>

          <div className="enquiries-calendar-foot">
            <span>
              {!value.from
                ? "Pick a day, or a second day for a range"
                : value.to
                  ? "Range selected"
                  : "Single day · pick another for a range"}
            </span>
            <button
              type="button"
              className="dash-btn dash-btn-ghost dash-btn-sm"
              onClick={() => {
                onChange({ from: "", to: "" });
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
