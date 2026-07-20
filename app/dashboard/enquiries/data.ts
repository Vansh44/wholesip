import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { enquiries, enquiryAdmin } from "@/drizzle/schema";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import { DASHBOARD_PAGE_SIZE, sanitizeSearch } from "../lib/list-params";
import { NO_SUBJECT, type Enquiry } from "./shared";
import type { EnquiryStatus } from "@/app/actions/enquiry-actions";

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

// Aliased select preserving the snake_case shape the views/components expect.
const ENQUIRY_COLUMNS = {
  id: enquiryAdmin.id,
  name: enquiryAdmin.name,
  email: enquiryAdmin.email,
  phone: enquiryAdmin.phone,
  subject: enquiryAdmin.subject,
  subject_detail: enquiryAdmin.subjectDetail,
  message: enquiryAdmin.message,
  status: enquiryAdmin.status,
  created_at: enquiryAdmin.createdAt,
};

/**
 * Count of enquiries still in the "new" state — drives the sidebar badge.
 * Returns 0 on any error (e.g. table not migrated) so the nav still renders.
 */
export async function getNewEnquiriesCount(): Promise<number> {
  try {
    const storeId = await getActingStoreId();
    const [row] = await withService((db) =>
      db
        .select({ n: count() })
        .from(enquiries)
        .where(
          and(eq(enquiries.storeId, storeId), eq(enquiries.status, "new")),
        ),
    );
    return row?.n ?? 0;
  } catch {
    return 0;
  }
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

  const conds = [eq(enquiryAdmin.storeId, await getActingStoreId())];

  const term = sanitizeSearch(query.q ?? "");
  if (term) {
    const pat = `%${term}%`;
    conds.push(
      or(
        ilike(enquiryAdmin.name, pat),
        ilike(enquiryAdmin.email, pat),
        ilike(enquiryAdmin.phone, pat),
        ilike(enquiryAdmin.subject, pat),
        ilike(enquiryAdmin.subjectDetail, pat),
        ilike(enquiryAdmin.message, pat),
      )!,
    );
  }

  if (status !== "all") conds.push(eq(enquiryAdmin.status, status));

  if (query.subject) {
    conds.push(
      query.subject === NO_SUBJECT
        ? isNull(enquiryAdmin.subject)
        : eq(enquiryAdmin.subject, query.subject),
    );
  }

  if (query.from)
    conds.push(gte(enquiryAdmin.createdAt, `${query.from}T00:00:00`));
  if (query.to)
    conds.push(lte(enquiryAdmin.createdAt, `${query.to}T23:59:59.999`));

  const whereExpr = and(...conds);

  const order =
    sort === "newest"
      ? [desc(enquiryAdmin.createdAt)]
      : sort === "oldest"
        ? [asc(enquiryAdmin.createdAt)]
        : [asc(enquiryAdmin.statusRank), desc(enquiryAdmin.createdAt)];

  try {
    const { rows, total } = await withService(async (db) => {
      const [rows, countRows] = await Promise.all([
        db
          .select(ENQUIRY_COLUMNS)
          .from(enquiryAdmin)
          .where(whereExpr)
          .orderBy(...order)
          .limit(pageSize)
          .offset(offset),
        db.select({ n: count() }).from(enquiryAdmin).where(whereExpr),
      ]);
      return { rows, total: countRows[0]?.n ?? 0 };
    });
    return {
      data: rows as Enquiry[],
      total,
      page,
      pageSize,
      error: false,
    };
  } catch (err) {
    console.error("Failed to load enquiries:", err);
    return { data: [], total: 0, page, pageSize, error: true };
  }
}

/** Global status counts for the metric cards (count-only, no rows transferred). */
export async function getEnquiryStats(): Promise<EnquiryStats> {
  const stats: EnquiryStats = {
    all: 0,
    new: 0,
    in_progress: 0,
    resolved: 0,
    archived: 0,
  };
  try {
    const storeId = await getActingStoreId();
    // One grouped count instead of five separate head-count round trips.
    const rows = await withService((db) =>
      db
        .select({ status: enquiries.status, n: count() })
        .from(enquiries)
        .where(eq(enquiries.storeId, storeId))
        .groupBy(enquiries.status),
    );
    for (const row of rows) {
      stats.all += row.n;
      if (
        row.status === "new" ||
        row.status === "in_progress" ||
        row.status === "resolved" ||
        row.status === "archived"
      ) {
        stats[row.status] = row.n;
      }
    }
  } catch (err) {
    console.error("Failed to load enquiry stats:", err);
  }
  return stats;
}

/** Distinct subjects for the filter dropdown (+ whether any have none). */
export async function getEnquirySubjects(): Promise<{
  subjects: string[];
  hasNone: boolean;
}> {
  try {
    const storeId = await getActingStoreId();
    const res = await withService((db) =>
      db.execute(
        sql`select subject from distinct_enquiry_subjects(${storeId})`,
      ),
    );
    const subjects: string[] = [];
    let hasNone = false;
    for (const row of res.rows as { subject: string | null }[]) {
      if (row.subject) subjects.push(row.subject);
      else hasNone = true;
    }
    subjects.sort((a, b) => a.localeCompare(b));
    return { subjects, hasNone };
  } catch {
    return { subjects: [], hasNone: false };
  }
}

/** A single enquiry by id, or null if missing / table not migrated. */
export async function getEnquiry(id: string): Promise<Enquiry | null> {
  try {
    const storeId = await getActingStoreId();
    const [row] = await withService((db) =>
      db
        .select(ENQUIRY_COLUMNS)
        .from(enquiryAdmin)
        .where(and(eq(enquiryAdmin.id, id), eq(enquiryAdmin.storeId, storeId)))
        .limit(1),
    );
    return (row as Enquiry) ?? null;
  } catch {
    return null;
  }
}
