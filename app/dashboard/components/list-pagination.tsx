"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Prev/next pagination footer shared by the dashboard list pages. Renders
 * nothing when there's only one page. `busy` disables the controls during an
 * in-flight navigation.
 */
export function ListPagination({
  page,
  total,
  pageSize,
  onPage,
  busy = false,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="dash-pagination">
      <button
        type="button"
        className="dash-btn dash-btn-ghost dash-btn-sm"
        disabled={page <= 1 || busy}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>
      <span className="dash-pagination-info">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="dash-btn dash-btn-ghost dash-btn-sm"
        disabled={page >= totalPages || busy}
        onClick={() => onPage(page + 1)}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
