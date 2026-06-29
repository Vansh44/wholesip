// Shared helpers for server-paginated dashboard list pages.

/** Normalize a Next searchParams value (string | string[] | undefined). */
export function pickParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** Parse a 1-based page number from a search param, clamped to >= 1. */
export function pickPage(v: string | string[] | undefined): number {
  const n = parseInt(pickParam(v) || "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Strip PostgREST filter-control characters so a search term can't break the
 *  `.or()` expression (it is interpolated straight into the filter string). */
export function sanitizeSearch(q: string): string {
  return q
    .replace(/[(),:*%\\]/g, " ")
    .trim()
    .slice(0, 100);
}

/** Build a PostgREST `.or()` substring (ILIKE) filter across several columns. */
export function ilikeOr(columns: string[], term: string): string {
  const like = `*${term}*`;
  return columns.map((c) => `${c}.ilike.${like}`).join(",");
}

/** Default rows per dashboard list page. */
export const DASHBOARD_PAGE_SIZE = 50;
