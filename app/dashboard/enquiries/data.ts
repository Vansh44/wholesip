import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import {
  DASHBOARD_PAGE_SIZE,
  ilikeOr,
  sanitizeSearch,
} from "../lib/list-params";
import { NO_SUBJECT, type Enquiry } from "./shared";
import type { EnquiryStatus } from "@/app/actions/enquiry-actions";

// Enquiries RLS is locked down (admin client only) — see enquiries_table.sql.
const COLUMNS =
  "id, name, email, phone, subject, subject_detail, message, status, created_at";

export type EnquirySort = "status" | "newest" | "oldest";
export type EnquiryFilter = "all" | EnquiryStatus;

export interface EnquiryQuery {
  page?: number;
  q?: string;
  status?: EnquiryFilter;
  subject?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  sort?: EnquirySort;
}

export interface EnquiriesResult {
  data: Enquiry[];
  total: number;
  page: number;
  pageSize: number;
  error: boolean;
}

export interface EnquiryStats {
  all: number;
  new: number;
  in_progress: number;
  resolved: number;
  archived: number;
}

/**
 * Count of enquiries still in the "new" state — drives the sidebar badge.
 * Returns 0 on any error (e.g. table not migrated) so the nav still renders.
 */
export async function getNewEnquiriesCount(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("store_id", await getActingStoreId())
    .eq("status", "new");

  if (error) return 0;
  return count ?? 0;
}

/** One page of enquiries, filtered/sorted in SQL via the enquiry_admin view. */
export async function getEnquiries(
  query: EnquiryQuery = {},
): Promise<EnquiriesResult> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = DASHBOARD_PAGE_SIZE;
  const offset = (page - 1) * pageSize;
  const status = query.status ?? "all";
  const sort = query.sort ?? "status";

  const admin = createAdminClient();
  let q = admin
    .from("enquiry_admin")
    .select(COLUMNS, { count: "exact" })
    .eq("store_id", await getActingStoreId());

  const term = sanitizeSearch(query.q ?? "");
  if (term) {
    q = q.or(
      ilikeOr(
        ["name", "email", "phone", "subject", "subject_detail", "message"],
        term,
      ),
    );
  }

  if (status !== "all") q = q.eq("status", status);

  if (query.subject) {
    q =
      query.subject === NO_SUBJECT
        ? q.is("subject", null)
        : q.eq("subject", query.subject);
  }

  if (query.from) q = q.gte("created_at", `${query.from}T00:00:00`);
  if (query.to) q = q.lte("created_at", `${query.to}T23:59:59.999`);

  if (sort === "newest") {
    q = q.order("created_at", { ascending: false });
  } else if (sort === "oldest") {
    q = q.order("created_at", { ascending: true });
  } else {
    q = q
      .order("status_rank", { ascending: true })
      .order("created_at", { ascending: false });
  }

  const { data, error, count } = await q.range(offset, offset + pageSize - 1);

  if (error) {
    console.error(
      "Failed to load enquiries (apply supabase/enquiries_table.sql + supabase/enquiry_admin.sql?):",
      error,
    );
    return { data: [], total: 0, page, pageSize, error: true };
  }
  return {
    data: (data ?? []) as Enquiry[],
    total: count ?? 0,
    page,
    pageSize,
    error: false,
  };
}

/** Global status counts for the metric cards (count-only, no rows transferred). */
export async function getEnquiryStats(): Promise<EnquiryStats> {
  const admin = createAdminClient();
  const storeId = await getActingStoreId();
  const head = () =>
    admin
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);

  const [allRes, newRes, progRes, resolvedRes, archivedRes] = await Promise.all(
    [
      head(),
      head().eq("status", "new"),
      head().eq("status", "in_progress"),
      head().eq("status", "resolved"),
      head().eq("status", "archived"),
    ],
  );

  return {
    all: allRes.count ?? 0,
    new: newRes.count ?? 0,
    in_progress: progRes.count ?? 0,
    resolved: resolvedRes.count ?? 0,
    archived: archivedRes.count ?? 0,
  };
}

/** Distinct subjects for the filter dropdown (+ whether any have none). */
export async function getEnquirySubjects(): Promise<{
  subjects: string[];
  hasNone: boolean;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("distinct_enquiry_subjects");
  if (error || !data) return { subjects: [], hasNone: false };

  const subjects: string[] = [];
  let hasNone = false;
  for (const row of data as { subject: string | null }[]) {
    if (row.subject) subjects.push(row.subject);
    else hasNone = true;
  }
  subjects.sort((a, b) => a.localeCompare(b));
  return { subjects, hasNone };
}

/** A single enquiry by id, or null if missing / table not migrated. */
export async function getEnquiry(id: string): Promise<Enquiry | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("enquiries")
    .select(COLUMNS)
    .eq("id", id)
    .eq("store_id", await getActingStoreId())
    .single();
  if (error || !data) return null;
  return data as Enquiry;
}
