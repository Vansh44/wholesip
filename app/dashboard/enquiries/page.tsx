import type { EnquiryStatus } from "@/app/actions/enquiry-actions";
import { requireSectionAccess } from "../lib/access";
import { pickPage, pickParam } from "../lib/list-params";
import {
  getEnquiries,
  getEnquiryStats,
  getEnquirySubjects,
  type EnquiryFilter,
  type EnquirySort,
} from "./data";
import { EnquiriesManagementView } from "./enquiries-management-view";

const FILTERS: EnquiryFilter[] = [
  "all",
  "new",
  "in_progress",
  "resolved",
  "archived",
];
const SORTS: EnquirySort[] = ["status", "newest", "oldest"];

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireSectionAccess("enquiries", "view");
  const canManage = access.can("enquiries", "manage");

  const sp = await searchParams;
  const page = pickPage(sp.page);
  const q = pickParam(sp.q);
  const statusParam = pickParam(sp.status) as EnquiryFilter;
  const status = FILTERS.includes(statusParam) ? statusParam : "all";
  const sortParam = pickParam(sp.sort) as EnquirySort;
  const sort = SORTS.includes(sortParam) ? sortParam : "status";
  const subject = pickParam(sp.subject);
  const from = pickParam(sp.from);
  const to = pickParam(sp.to);

  const [{ data, total, pageSize }, stats, subjectOptions] = await Promise.all([
    getEnquiries({ page, q, status, subject, from, to, sort }),
    getEnquiryStats(),
    getEnquirySubjects(),
  ]);

  return (
    <EnquiriesManagementView
      enquiries={data}
      canManage={canManage}
      stats={stats}
      subjectOptions={subjectOptions}
      total={total}
      page={page}
      pageSize={pageSize}
      query={q}
      status={status as "all" | EnquiryStatus}
      subject={subject}
      fromDate={from}
      toDate={to}
      sort={sort}
    />
  );
}
